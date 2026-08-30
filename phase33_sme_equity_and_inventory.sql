-- Phase 33: SME Equity Restructuring & Inventory Account Consolidation
-- 1. Redefine initialize_default_accounts function to remove Retained Earnings,
-- use Owner's Capital & Owner's Drawings, and consolidate inventory accounts.

CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Assets
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Main Bank Account', 'asset', true, true),
    (p_user_id, 'Petty Cash', 'asset', true, true),
    (p_user_id, 'Accounts Receivable', 'asset', true, false),
    (p_user_id, 'Supplier Advances / Prepaid Expenses', 'asset', true, false),
    (p_user_id, 'Inventory Asset', 'asset', true, false),
    (p_user_id, 'Fixed Assets - Office/Equipment', 'asset', true, false),
    (p_user_id, 'Fixed Assets - Equipment/Furniture', 'asset', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Liabilities
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Accounts Payable', 'liability', true, false),
    (p_user_id, 'Customer Advances / Unearned Revenue', 'liability', true, false),
    (p_user_id, 'Sales Tax Payable', 'liability', true, false),
    (p_user_id, 'Loan Payable', 'liability', true, false),
    (p_user_id, 'Long-Term Loan Payable', 'liability', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Equity (Corporate structure replaced with SME/Sole Proprietorship structure)
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Owner''s Capital', 'equity', true, false),
    (p_user_id, 'Owner''s Drawings', 'equity', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Revenue
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Sales Revenue', 'revenue', true, false),
    (p_user_id, 'Service Revenue', 'revenue', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Expenses
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Cost of Goods Sold', 'expense', true, false),
    (p_user_id, 'Rent Expense', 'expense', true, false),
    (p_user_id, 'Utilities', 'expense', true, false),
    (p_user_id, 'Software & Hosting', 'expense', true, false),
    (p_user_id, 'Interest Expense', 'expense', true, false),
    (p_user_id, 'General Operating Expense', 'expense', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- 2. Consolidate "Inventory" and "Inventory Asset" and clean up corporate equity
DO $$
DECLARE
  r RECORD;
  v_inv_asset_id UUID;
  v_inv_old_id UUID;
  v_capital_id UUID;
  v_equity_old_id UUID;
  v_drawings_old_id UUID;
  v_drawings_new_id UUID;
  v_retained_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM accounts LOOP
    -- Seeding new Capital & Drawings if they don't exist
    PERFORM initialize_default_accounts(r.user_id);

    -- Get IDs
    SELECT id INTO v_inv_asset_id FROM accounts WHERE user_id = r.user_id AND name = 'Inventory Asset' LIMIT 1;
    SELECT id INTO v_inv_old_id FROM accounts WHERE user_id = r.user_id AND name = 'Inventory' AND type = 'expense' LIMIT 1;

    -- Consolidate Inventory Asset references
    IF v_inv_asset_id IS NOT NULL AND v_inv_old_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_inv_asset_id WHERE account_id = v_inv_old_id;
      UPDATE bill_lines SET account_id = v_inv_asset_id WHERE account_id = v_inv_old_id;
      UPDATE invoice_lines SET account_id = v_inv_asset_id WHERE account_id = v_inv_old_id;
      DELETE FROM accounts WHERE id = v_inv_old_id;
    END IF;

    -- Clean up corporate equity
    SELECT id INTO v_equity_old_id FROM accounts WHERE user_id = r.user_id AND name = 'Owners Equity' LIMIT 1;
    SELECT id INTO v_capital_id FROM accounts WHERE user_id = r.user_id AND name = 'Owner''s Capital' LIMIT 1;
    SELECT id INTO v_drawings_old_id FROM accounts WHERE user_id = r.user_id AND name = 'Owner Drawings' LIMIT 1;
    SELECT id INTO v_drawings_new_id FROM accounts WHERE user_id = r.user_id AND name = 'Owner''s Drawings' LIMIT 1;
    SELECT id INTO v_retained_id FROM accounts WHERE user_id = r.user_id AND name = 'Retained Earnings' LIMIT 1;

    -- Move Owners Equity -> Owner's Capital
    IF v_equity_old_id IS NOT NULL AND v_capital_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_capital_id WHERE account_id = v_equity_old_id;
      DELETE FROM accounts WHERE id = v_equity_old_id;
    END IF;

    -- Move Owner Drawings -> Owner's Drawings
    IF v_drawings_old_id IS NOT NULL AND v_drawings_new_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_drawings_new_id WHERE account_id = v_drawings_old_id;
      DELETE FROM accounts WHERE id = v_drawings_old_id;
    END IF;

    -- Move Retained Earnings -> Owner's Capital
    IF v_retained_id IS NOT NULL AND v_capital_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_capital_id WHERE account_id = v_retained_id;
      DELETE FROM accounts WHERE id = v_retained_id;
    END IF;

  END LOOP;
END $$;

-- 3. REDEFINE TRG_INVOICE_VERIFICATION TO HANDLE STOCK ADJUSTMENTS & REVENUE CLASSIFICATION
CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_sales_revenue_id UUID;
    v_service_revenue_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    v_sales_revenue_total NUMERIC := 0;
    v_service_revenue_total NUMERIC := 0;
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

        IF v_ar_account_id IS NULL OR v_sales_revenue_id IS NULL OR v_service_revenue_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Invoice ' || NEW.id, 'invoice', NEW.id)
        RETURNING id INTO v_je_id;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_je_id, v_ar_account_id, NEW.total_amount, 0);

        FOR rec IN 
            SELECT il.product_id, il.quantity, il.total, p.is_inventory_tracked, p.cost 
            FROM invoice_lines il 
            LEFT JOIN products p ON p.id = il.product_id 
            WHERE il.invoice_id = NEW.id 
        LOOP
            IF rec.is_inventory_tracked = true THEN
                v_sales_revenue_total := v_sales_revenue_total + COALESCE(rec.total, 0);
                v_cogs_total := v_cogs_total + (COALESCE(rec.quantity, 0) * COALESCE(rec.cost, 0));

                UPDATE products 
                SET inventory_count = inventory_count - rec.quantity 
                WHERE id = rec.product_id;
            ELSE
                v_service_revenue_total := v_service_revenue_total + COALESCE(rec.total, 0);
            END IF;
        END LOOP;

        IF v_sales_revenue_total > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
            VALUES (v_je_id, v_sales_revenue_id, 0, v_sales_revenue_total);
        END IF;

        IF v_service_revenue_total > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
            VALUES (v_je_id, v_service_revenue_id, 0, v_service_revenue_total);
        END IF;

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

DROP TRIGGER IF EXISTS trg_invoice_verification ON invoices;
CREATE TRIGGER trg_invoice_verification
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION trg_invoice_verification();

-- 4. REDEFINE TRG_BILL_VERIFICATION TO HANDLE STOCK ADJUSTMENTS & WEIGHTED AVERAGE COSTING (WAC)
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

        IF v_inventory_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Inventory Asset', 'asset', true) RETURNING id INTO v_inventory_account_id;
        END IF;

        IF v_ap_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Bill ' || NEW.id, 'bill', NEW.id)
        RETURNING id INTO v_je_id;

        FOR rec IN 
            SELECT bl.*, p.is_inventory_tracked, p.inventory_count, p.cost 
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
                INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
                VALUES (v_je_id, v_target_account, COALESCE(rec.amount, 0), 0);
            END IF;
        END LOOP;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
        VALUES (v_je_id, v_ap_account_id, 0, NEW.total_amount);
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

-- 5. UPGRADE ATOMIC UPDATE FUNCTIONS TO SWAP ORDER & REMOVE MANUAL LEDGER WRITES
CREATE OR REPLACE FUNCTION update_invoice_atomic(
  p_invoice_id UUID,
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM invoices WHERE id = p_invoice_id AND user_id = p_user_id;

  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  -- 1. Delete lines first
  DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

  -- 2. Insert new lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, total)
    VALUES (
      p_invoice_id, 
      NULLIF(v_item->>'product_id', '')::UUID, 
      v_item->>'description', 
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC
    );
  END LOOP;

  -- 3. Update invoice parent (which fires the trigger and rebuilds journal entry with new lines)
  UPDATE invoices SET 
    customer_id = p_customer_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_invoice_id AND user_id = p_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_bill_atomic(
  p_bill_id UUID,
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM bills WHERE id = p_bill_id AND user_id = p_user_id;
  
  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  -- 1. Delete lines first
  DELETE FROM bill_lines WHERE bill_id = p_bill_id;

  -- 2. Insert new lines
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (bill_id, account_id, product_id, quantity, unit_price, description, amount)
    VALUES (
      p_bill_id, 
      NULLIF(v_item->>'account_id', '')::UUID, 
      NULLIF(v_item->>'product_id', '')::UUID, 
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'amount')::NUMERIC),
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC
    );
  END LOOP;

  -- 3. Update bill parent (which fires the trigger and rebuilds journal entry with new lines)
  UPDATE bills SET 
    supplier_id = p_supplier_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_bill_id AND user_id = p_user_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. GAAP Loan Schema Upgrade & Atomic RPCs
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES accounts(id);

CREATE OR REPLACE FUNCTION receive_loan_atomic(
    p_user_id UUID,
    p_lender_name TEXT,
    p_time_horizon TEXT, -- 'short' or 'long'
    p_bank_account_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_description TEXT
) RETURNS UUID AS $$
DECLARE
    v_parent_name TEXT;
    v_parent_id UUID;
    v_lender_account_id UUID;
    v_je_id UUID;
BEGIN
    -- 1. Determine parent category name based on time horizon
    IF p_time_horizon = 'short' THEN
        v_parent_name := 'Loan Payable';
    ELSE
        v_parent_name := 'Long-Term Loan Payable';
    END IF;

    -- 2. Find parent account
    SELECT id INTO v_parent_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = v_parent_name AND type = 'liability' 
    LIMIT 1;

    IF v_parent_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system)
        VALUES (p_user_id, v_parent_name, 'liability', true)
        RETURNING id INTO v_parent_id;
    END IF;

    -- 3. Create or find specific lender account
    SELECT id INTO v_lender_account_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = p_lender_name AND type = 'liability' 
    LIMIT 1;

    IF v_lender_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, parent_id, is_system)
        VALUES (p_user_id, p_lender_name, 'liability', v_parent_id, false)
        RETURNING id INTO v_lender_account_id;
    END IF;

    -- 4. Create balanced journal entry
    INSERT INTO journal_entries (user_id, date, description, reference_type)
    VALUES (p_user_id, p_date, p_description, 'LOAN_INFLOW')
    RETURNING id INTO v_je_id;

    -- 5. Debit Bank/Cash | Credit Specific Lender Account
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES 
        (v_je_id, p_bank_account_id, p_amount, 0),
        (v_je_id, v_lender_account_id, 0, p_amount);

    RETURN v_lender_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION repay_loan_atomic(
    p_user_id UUID,
    p_lender_account_id UUID,
    p_bank_account_id UUID,
    p_total_payment NUMERIC,
    p_interest_amount NUMERIC,
    p_date DATE,
    p_description TEXT
) RETURNS VOID AS $$
DECLARE
    v_interest_acc_id UUID;
    v_je_id UUID;
    v_principal_amount NUMERIC;
BEGIN
    v_principal_amount := p_total_payment - p_interest_amount;

    -- Find or create Interest Expense account
    SELECT id INTO v_interest_acc_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = 'Interest Expense' AND type = 'expense' 
    LIMIT 1;

    IF v_interest_acc_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system)
        VALUES (p_user_id, 'Interest Expense', 'expense', true)
        RETURNING id INTO v_interest_acc_id;
    END IF;

    -- Create journal entry
    INSERT INTO journal_entries (user_id, date, description, reference_type)
    VALUES (p_user_id, p_date, p_description, 'LOAN_REPAYMENT')
    RETURNING id INTO v_je_id;

    -- Post lines:
    -- Credit Bank/Cash (Total Payment)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_je_id, p_bank_account_id, 0, p_total_payment);

    -- Debit Interest Expense (Interest Amount)
    IF p_interest_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_je_id, v_interest_acc_id, p_interest_amount, 0);
    END IF;

    -- Debit Specific Lender Account (Principal Amount)
    IF v_principal_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_je_id, p_lender_account_id, v_principal_amount, 0);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

