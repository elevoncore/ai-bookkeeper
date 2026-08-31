-- =========================================================================
-- PHASE 36: LEDGER DESCRIPTION PASSTHROUGH & ATOMIC PRODUCT CREATION
-- =========================================================================

-- 1. Ensure description column exists on journal_lines table
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Atomic Product Creation Function for CreatableSelect
CREATE OR REPLACE FUNCTION public.create_product_atomic(
  p_user_id UUID,
  p_name TEXT,
  p_price NUMERIC DEFAULT 0,
  p_cost NUMERIC DEFAULT 0,
  p_is_inventory_tracked BOOLEAN DEFAULT TRUE,
  p_currency_code TEXT DEFAULT 'PKR'
) RETURNS UUID AS $$
DECLARE
  v_prod_id UUID;
BEGIN
  INSERT INTO products (
    user_id,
    name,
    price,
    cost,
    inventory_count,
    is_inventory_tracked,
    currency_code,
    created_by_source,
    is_manually_edited
  ) VALUES (
    p_user_id,
    TRIM(p_name),
    COALESCE(p_price, 0),
    COALESCE(p_cost, 0),
    0,
    COALESCE(p_is_inventory_tracked, TRUE),
    COALESCE(p_currency_code, 'PKR'),
    'MANUAL',
    FALSE
  )
  RETURNING id INTO v_prod_id;

  RETURN v_prod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Upgrade trg_bill_verification to Pass Line Description into journal_lines
CREATE OR REPLACE FUNCTION trg_bill_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ap_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    rec RECORD;
    v_target_account UUID;
    v_curr_stock NUMERIC;
    v_curr_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
    v_supplier_name TEXT;
BEGIN
    -- 1. Revert stock increment if old state was verified
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.is_ai_verified = true THEN
        FOR rec IN 
            SELECT bl.product_id, bl.quantity 
            FROM bill_lines bl 
            JOIN products p ON p.id = bl.product_id 
            WHERE bl.bill_id = OLD.id AND p.is_inventory_tracked = true 
        LOOP
            UPDATE products 
            SET inventory_count = inventory_count - rec.quantity 
            WHERE id = rec.product_id;
        END LOOP;

        DELETE FROM journal_entries WHERE reference_id = OLD.id AND reference_type = 'bill';
    END IF;

    -- 2. Apply stock increment, costing calculations, and ledger lines if new state is verified
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_ai_verified = true THEN
        SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
        SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;
        
        SELECT name INTO v_supplier_name FROM suppliers WHERE id = NEW.supplier_id LIMIT 1;

        IF v_inventory_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Inventory Asset', 'asset', true) RETURNING id INTO v_inventory_account_id;
        END IF;

        IF v_ap_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, COALESCE('Bill - ' || v_supplier_name, 'Bill ' || NEW.id), 'bill', NEW.id)
        RETURNING id INTO v_je_id;

        FOR rec IN 
            SELECT bl.*, p.name AS product_name, p.is_inventory_tracked, p.inventory_count, p.cost 
            FROM bill_lines bl 
            LEFT JOIN products p ON p.id = bl.product_id 
            WHERE bl.bill_id = NEW.id 
        LOOP
            IF rec.is_inventory_tracked = true THEN
                v_target_account := v_inventory_account_id;
                
                v_curr_stock := GREATEST(0, COALESCE(rec.inventory_count, 0));
                v_curr_cost := COALESCE(rec.cost, 0);
                v_new_stock := v_curr_stock + rec.quantity;
                
                IF v_new_stock > 0 THEN
                    v_new_cost := ((v_curr_stock * v_curr_cost) + COALESCE(rec.amount, 0)) / v_new_stock;
                ELSE
                    v_new_cost := v_curr_cost;
                END IF;

                UPDATE products 
                SET inventory_count = v_new_stock, cost = v_new_cost 
                WHERE id = rec.product_id;
            ELSE
                v_target_account := rec.account_id;
            END IF;

            IF v_target_account IS NOT NULL THEN
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
                VALUES (
                    v_je_id, 
                    v_target_account, 
                    COALESCE(rec.amount, 0), 
                    0, 
                    COALESCE(NULLIF(TRIM(rec.description), ''), rec.product_name, 'Bill Line Item')
                );
            END IF;
        END LOOP;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
        VALUES (
            v_je_id, 
            v_ap_account_id, 
            0, 
            NEW.total_amount, 
            COALESCE('Accounts Payable - ' || v_supplier_name, 'Accounts Payable - Bill ' || NEW.id)
        );
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bill_verification ON bills;
CREATE TRIGGER trg_bill_verification
AFTER INSERT OR UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION trg_bill_verification();

-- 4. Upgrade trg_invoice_verification to Pass Line Description into journal_lines
CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_sales_revenue_id UUID;
    v_service_revenue_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    rec RECORD;
    v_cogs_amount NUMERIC := 0;
    v_target_account UUID;
    v_customer_name TEXT;
BEGIN
    -- 1. Revert stock decrement and delete old ledger lines if previous state was verified
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.is_ai_verified = true THEN
        FOR rec IN 
            SELECT il.product_id, il.quantity 
            FROM invoice_lines il 
            JOIN products p ON p.id = il.product_id 
            WHERE il.invoice_id = OLD.id AND p.is_inventory_tracked = true 
        LOOP
            UPDATE products 
            SET inventory_count = inventory_count + rec.quantity 
            WHERE id = rec.product_id;
        END LOOP;

        DELETE FROM journal_entries WHERE reference_id = OLD.id AND reference_type = 'invoice';
    END IF;

    -- 2. Apply stock decrement and create full double-entry ledger lines if new state is verified
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_ai_verified = true THEN
        SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
        SELECT id INTO v_sales_revenue_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;
        SELECT id INTO v_service_revenue_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Service Revenue' LIMIT 1;
        SELECT id INTO v_cogs_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Cost of Goods Sold' LIMIT 1;
        SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

        SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id LIMIT 1;

        IF v_ar_account_id IS NULL OR v_sales_revenue_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, COALESCE('Invoice - ' || v_customer_name, 'Invoice ' || NEW.id), 'invoice', NEW.id)
        RETURNING id INTO v_je_id;

        -- A. Post AR Debit
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
        VALUES (
            v_je_id, 
            v_ar_account_id, 
            NEW.total_amount, 
            0, 
            COALESCE('Accounts Receivable - ' || v_customer_name, 'Accounts Receivable - Invoice ' || NEW.id)
        );

        -- B. Post Line-level Revenue Credits
        FOR rec IN 
            SELECT il.account_id, il.product_id, il.quantity, il.total, il.description, p.name AS product_name, p.is_inventory_tracked, p.cost 
            FROM invoice_lines il 
            LEFT JOIN products p ON p.id = il.product_id 
            WHERE il.invoice_id = NEW.id 
        LOOP
            IF rec.is_inventory_tracked = true THEN
                v_target_account := v_sales_revenue_id;
                
                UPDATE products 
                SET inventory_count = inventory_count - rec.quantity 
                WHERE id = rec.product_id;

                v_cogs_amount := v_cogs_amount + (rec.quantity * COALESCE(rec.cost, 0));
            ELSE
                IF rec.account_id IS NOT NULL THEN
                    v_target_account := rec.account_id;
                ELSE
                    IF rec.product_id IS NOT NULL THEN
                        v_target_account := COALESCE(v_service_revenue_id, v_sales_revenue_id);
                    ELSE
                        v_target_account := v_sales_revenue_id;
                    END IF;
                END IF;
            END IF;

            IF v_target_account IS NOT NULL THEN
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
                VALUES (
                    v_je_id, 
                    v_target_account, 
                    0, 
                    COALESCE(rec.total, 0), 
                    COALESCE(NULLIF(TRIM(rec.description), ''), rec.product_name, 'Invoice Line Item')
                );
            END IF;
        END LOOP;

        -- C. Post COGS & Inventory Asset entries for tracked products
        IF v_cogs_amount > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
            VALUES (v_je_id, v_cogs_account_id, v_cogs_amount, 0, 'Cost of Goods Sold - Invoice ' || NEW.id);
            
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description) 
            VALUES (v_je_id, v_inventory_account_id, 0, v_cogs_amount, 'Inventory Asset Realization - Invoice ' || NEW.id);
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_verification ON invoices;
CREATE TRIGGER trg_invoice_verification
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION trg_invoice_verification();
