-- Phase 35: Invoice Custom GL Account Support and Nullable Product ID
-- 1. Ensure product_id is nullable on invoice_lines and bill_lines
ALTER TABLE invoice_lines ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE bill_lines ALTER COLUMN product_id DROP NOT NULL;

-- 2. Add account_id to invoice_lines if it does not exist
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

-- 3. Redefine create_invoice_with_lines_atomic to map account_id from JSONB line items
CREATE OR REPLACE FUNCTION public.create_invoice_with_lines_atomic(
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB,
  p_currency_code TEXT DEFAULT 'PKR',
  p_exchange_rate NUMERIC DEFAULT 1.0,
  p_original_amount NUMERIC DEFAULT NULL,
  p_created_by_source TEXT DEFAULT 'AI'
) RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_item JSONB;
BEGIN
  INSERT INTO invoices (
    user_id, customer_id, issue_date, due_date, status, 
    total_amount, balance_due, is_ai_verified, receipt_url,
    currency_code, exchange_rate, original_amount,
    created_by_source, is_manually_edited
  )
  VALUES (
    p_user_id, p_customer_id, p_issue_date, p_due_date, p_status, 
    p_total_amount, CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url,
    COALESCE(p_currency_code, 'PKR'), COALESCE(p_exchange_rate, 1.0), COALESCE(p_original_amount, p_total_amount),
    COALESCE(p_created_by_source, 'AI'), false
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id, product_id, account_id, description, quantity, unit_price, total,
      currency_code, exchange_rate
    )
    VALUES (
      v_invoice_id, 
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'account_id', '')::UUID,
      v_item->>'description', 
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC,
      COALESCE(p_currency_code, 'PKR'),
      COALESCE(p_exchange_rate, 1.0)
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Redefine trg_invoice_verification trigger to credit the line-level account_id if specified, or fallback to Sales/Service Revenue
CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_sales_revenue_id UUID;
    v_service_revenue_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    v_cogs_total NUMERIC := 0;
    rec RECORD;
BEGIN
    -- 1. Revert stock and delete journal entries if old state was verified
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

    -- 2. Apply stock deduction and post journal entries if new state is verified
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_ai_verified = true THEN
        SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
        SELECT id INTO v_sales_revenue_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;
        SELECT id INTO v_service_revenue_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Service Revenue' LIMIT 1;
        SELECT id INTO v_cogs_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Cost of Goods Sold' LIMIT 1;
        SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

        IF v_cogs_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Cost of Goods Sold', 'expense', true) RETURNING id INTO v_cogs_account_id;
        END IF;
        IF v_inventory_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Inventory Asset', 'asset', true) RETURNING id INTO v_inventory_account_id;
        END IF;

        -- Create journal entry parent
        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Invoice ' || NEW.id, 'invoice', NEW.id)
        RETURNING id INTO v_je_id;

        -- Debit Accounts Receivable
        IF v_ar_account_id IS NOT NULL THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
            VALUES (v_je_id, v_ar_account_id, NEW.total_amount, 0);
        END IF;

        -- Post credit revenue lines dynamically
        FOR rec IN 
            SELECT il.account_id, il.product_id, il.quantity, il.total, p.is_inventory_tracked, p.cost 
            FROM invoice_lines il 
            LEFT JOIN products p ON p.id = il.product_id 
            WHERE il.invoice_id = NEW.id 
        LOOP
            IF rec.is_inventory_tracked = true THEN
                -- Inventory tracked product
                DECLARE
                    v_target_rev UUID := COALESCE(rec.account_id, v_sales_revenue_id);
                BEGIN
                    IF v_target_rev IS NOT NULL THEN
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
                        VALUES (v_je_id, v_target_rev, 0, COALESCE(rec.total, 0));
                    END IF;
                END;

                -- Deduct inventory & track COGS
                v_cogs_total := v_cogs_total + (COALESCE(rec.quantity, 0) * COALESCE(rec.cost, 0));
                UPDATE products 
                SET inventory_count = inventory_count - rec.quantity 
                WHERE id = rec.product_id;
            ELSE
                -- Non-inventory product or ad-hoc custom line item
                DECLARE
                    v_target_rev UUID := COALESCE(rec.account_id, v_service_revenue_id);
                BEGIN
                    IF v_target_rev IS NOT NULL THEN
                        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
                        VALUES (v_je_id, v_target_rev, 0, COALESCE(rec.total, 0));
                    END IF;
                END;
            END IF;
        END LOOP;

        -- Record COGS entry if any inventory products sold
        IF v_cogs_total > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
            VALUES 
                (v_je_id, v_cogs_account_id, v_cogs_total, 0),
                (v_je_id, v_inventory_account_id, 0, v_cogs_total);
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
