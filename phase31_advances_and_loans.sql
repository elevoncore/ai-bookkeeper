-- Phase 31: Advance Payments Engine (Customer & Supplier Deposits) & Dynamic Liability Tracking
-- Upgrades Chart of Accounts, Payments table schema, and Atomic RPCs

-- 1. Update initialize_default_accounts function to seed Customer Advances & Supplier Advances
CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Assets
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Main Bank Account', '1010', 'asset', true, true),
    (p_user_id, 'Petty Cash', '1020', 'asset', true, true),
    (p_user_id, 'Accounts Receivable', '1200', 'asset', true, false),
    (p_user_id, 'Supplier Advances / Prepaid Expenses', '1350', 'asset', true, false),
    (p_user_id, 'Inventory Asset', '1300', 'asset', true, false),
    (p_user_id, 'Fixed Assets - Office/Equipment', '1510', 'asset', true, false),
    (p_user_id, 'Fixed Assets - Equipment/Furniture', '1520', 'asset', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Liabilities
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Accounts Payable', '2010', 'liability', true, false),
    (p_user_id, 'Customer Advances / Unearned Revenue', '2100', 'liability', true, false),
    (p_user_id, 'Sales Tax Payable', '2020', 'liability', true, false),
    (p_user_id, 'Loan Payable', '2500', 'liability', true, false),
    (p_user_id, 'Long-Term Loan Payable', '2510', 'liability', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Equity
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Owners Equity', '3010', 'equity', true, false),
    (p_user_id, 'Owner Drawings', '3020', 'equity', true, false),
    (p_user_id, 'Retained Earnings', '3030', 'equity', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Revenue
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Sales Revenue', '4010', 'revenue', true, false),
    (p_user_id, 'Service Revenue', '4020', 'revenue', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Expenses
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Cost of Goods Sold', '5010', 'expense', true, false),
    (p_user_id, 'Rent Expense', '5020', 'expense', true, false),
    (p_user_id, 'Utilities', '5030', 'expense', true, false),
    (p_user_id, 'Software & Hosting', '5040', 'expense', true, false),
    (p_user_id, 'Interest Expense', '5050', 'expense', true, false),
    (p_user_id, 'General Operating Expense', '5900', 'expense', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- 2. Ensure schema support for Unapplied Advances on payments_received and payments_made
DO $$
BEGIN
  -- payments_received schema enhancements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments_received') THEN
    ALTER TABLE public.payments_received ALTER COLUMN invoice_id DROP NOT NULL;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS is_advance BOOLEAN DEFAULT false;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS applied_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS notes TEXT;
  END IF;

  -- payments_made schema enhancements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments_made') THEN
    ALTER TABLE public.payments_made ALTER COLUMN bill_id DROP NOT NULL;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS is_advance BOOLEAN DEFAULT false;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS applied_bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS notes TEXT;
  END IF;
END $$;

-- 3. Seed new default accounts for all existing users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.accounts WHERE user_id IS NOT NULL LOOP
    PERFORM initialize_default_accounts(r.user_id);
  END LOOP;
END $$;

-- 4. Atomic Customer Advance Receipt RPC
CREATE OR REPLACE FUNCTION log_customer_advance_atomic(
    p_user_id UUID,
    p_customer_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_method TEXT,
    p_deposit_account_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_customer_name TEXT;
    v_advance_liability_id UUID;
    v_payment_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Advance amount must be greater than zero.';
    END IF;

    SELECT name INTO v_customer_name FROM customers WHERE id = p_customer_id AND user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer not found or unauthorized.';
    END IF;

    -- Resolve Customer Advances liability account
    SELECT id INTO v_advance_liability_id 
    FROM accounts 
    WHERE user_id = p_user_id AND type = 'liability' AND name ILIKE '%Customer Advance%'
    LIMIT 1;

    IF v_advance_liability_id IS NULL THEN
        INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
        VALUES (p_user_id, 'Customer Advances / Unearned Revenue', '2100', 'liability', true, false)
        RETURNING id INTO v_advance_liability_id;
    END IF;

    -- Insert Payment Record (Unapplied Advance)
    INSERT INTO payments_received (user_id, invoice_id, customer_id, amount, date, payment_method, is_advance, notes)
    VALUES (p_user_id, NULL, p_customer_id, p_amount, p_date, p_method, true, p_notes)
    RETURNING id INTO v_payment_id;

    -- Create Double-Entry Journal: Debit Cash/Bank, Credit Customer Advances (Liability)
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (p_user_id, p_date, 'Customer Advance Deposit from ' || v_customer_name, 'customer_advance', v_payment_id)
    RETURNING id INTO v_journal_id;

    -- Debit Cash/Bank (Asset increases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, p_deposit_account_id, p_amount, 0);

    -- Credit Customer Advances (Liability increases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_advance_liability_id, 0, p_amount);

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Atomic Supplier Advance Payment RPC
CREATE OR REPLACE FUNCTION log_supplier_advance_atomic(
    p_user_id UUID,
    p_supplier_id UUID,
    p_amount NUMERIC,
    p_date DATE,
    p_method TEXT,
    p_payment_account_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_supplier_name TEXT;
    v_advance_asset_id UUID;
    v_payment_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Advance amount must be greater than zero.';
    END IF;

    SELECT name INTO v_supplier_name FROM suppliers WHERE id = p_supplier_id AND user_id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Supplier not found or unauthorized.';
    END IF;

    -- Resolve Supplier Advances asset account
    SELECT id INTO v_advance_asset_id 
    FROM accounts 
    WHERE user_id = p_user_id AND type = 'asset' AND name ILIKE '%Supplier Advance%'
    LIMIT 1;

    IF v_advance_asset_id IS NULL THEN
        INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
        VALUES (p_user_id, 'Supplier Advances / Prepaid Expenses', '1350', 'asset', true, false)
        RETURNING id INTO v_advance_asset_id;
    END IF;

    -- Insert Payment Record (Unapplied Advance)
    INSERT INTO payments_made (user_id, bill_id, supplier_id, amount, date, payment_method, is_advance, notes)
    VALUES (p_user_id, NULL, p_supplier_id, p_amount, p_date, p_method, true, p_notes)
    RETURNING id INTO v_payment_id;

    -- Create Double-Entry Journal: Debit Supplier Advances (Asset), Credit Cash/Bank
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (p_user_id, p_date, 'Supplier Advance Payment to ' || v_supplier_name, 'supplier_advance', v_payment_id)
    RETURNING id INTO v_journal_id;

    -- Debit Supplier Advances (Asset increases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_advance_asset_id, p_amount, 0);

    -- Credit Cash/Bank (Asset decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, p_payment_account_id, 0, p_amount);

    RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Atomic Apply Customer Advance to Invoice RPC
CREATE OR REPLACE FUNCTION apply_customer_advance_atomic(
    p_user_id UUID,
    p_customer_id UUID,
    p_invoice_id UUID,
    p_amount NUMERIC,
    p_date DATE
)
RETURNS UUID AS $$
DECLARE
    v_invoice_record RECORD;
    v_advance_liability_id UUID;
    v_ar_account_id UUID;
    v_new_balance NUMERIC;
    v_new_paid NUMERIC;
    v_new_status TEXT;
    v_settlement_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero.';
    END IF;

    -- Lock invoice row
    SELECT * INTO v_invoice_record 
    FROM invoices 
    WHERE id = p_invoice_id AND user_id = p_user_id AND customer_id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found or does not belong to customer.';
    END IF;

    IF p_amount > (v_invoice_record.balance_due) THEN
        RAISE EXCEPTION 'Advance application amount exceeds invoice balance due.';
    END IF;

    -- Calculate invoice updates
    v_new_balance := v_invoice_record.balance_due - p_amount;
    v_new_paid := COALESCE(v_invoice_record.amount_paid, 0) + p_amount;
    v_new_status := CASE WHEN v_new_balance <= 0 THEN 'paid' ELSE 'partial' END;

    UPDATE invoices 
    SET balance_due = v_new_balance,
        amount_paid = v_new_paid,
        status = v_new_status
    WHERE id = p_invoice_id;

    -- Log payment settlement record
    INSERT INTO payments_received (user_id, invoice_id, customer_id, amount, date, payment_method, is_advance, notes)
    VALUES (p_user_id, p_invoice_id, p_customer_id, p_amount, p_date, 'advance_settlement', false, 'Settled from Customer Advance deposit')
    RETURNING id INTO v_settlement_id;

    -- Resolve Accounts
    SELECT id INTO v_advance_liability_id 
    FROM accounts 
    WHERE user_id = p_user_id AND type = 'liability' AND name ILIKE '%Customer Advance%' LIMIT 1;

    SELECT id INTO v_ar_account_id 
    FROM accounts 
    WHERE user_id = p_user_id AND type = 'asset' AND (name ILIKE '%Accounts Receivable%' OR name ILIKE '%A/R%') LIMIT 1;

    -- Create Settlement Journal Entry: Debit Customer Advances (Liability drops), Credit Accounts Receivable (A/R drops)
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (p_user_id, p_date, 'Customer Advance Applied to Invoice ' || p_invoice_id, 'advance_settlement', p_invoice_id)
    RETURNING id INTO v_journal_id;

    -- Debit Customer Advances (Liability decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_advance_liability_id, p_amount, 0);

    -- Credit Accounts Receivable (Asset decreases)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, v_ar_account_id, 0, p_amount);

    RETURN v_settlement_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Atomic Loan Repayment & Interest Splitter RPC
CREATE OR REPLACE FUNCTION record_loan_payment_atomic(
    p_user_id UUID,
    p_loan_account_id UUID,
    p_total_amount NUMERIC,
    p_interest_amount NUMERIC,
    p_payment_account_id UUID,
    p_date DATE,
    p_description TEXT DEFAULT 'Loan Repayment & Interest Service'
)
RETURNS UUID AS $$
DECLARE
    v_principal_amount NUMERIC;
    v_interest_expense_id UUID;
    v_journal_id UUID;
BEGIN
    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'Total payment amount must be greater than zero.';
    END IF;

    IF p_interest_amount < 0 THEN
        RAISE EXCEPTION 'Interest amount cannot be negative.';
    END IF;

    IF p_interest_amount > p_total_amount THEN
        RAISE EXCEPTION 'Interest amount cannot exceed total payment amount.';
    END IF;

    v_principal_amount := p_total_amount - p_interest_amount;

    -- Resolve Interest Expense Account
    SELECT id INTO v_interest_expense_id 
    FROM accounts 
    WHERE user_id = p_user_id AND type = 'expense' AND (name ILIKE '%Interest Expense%' OR name ILIKE '%Finance Cost%')
    LIMIT 1;

    IF v_interest_expense_id IS NULL THEN
        INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
        VALUES (p_user_id, 'Interest Expense', '5050', 'expense', true, false)
        RETURNING id INTO v_interest_expense_id;
    END IF;

    -- Stage balancing 3-line Journal Entry
    INSERT INTO journal_entries (user_id, date, description, reference_type)
    VALUES (p_user_id, p_date, p_description, 'loan_repayment')
    RETURNING id INTO v_journal_id;

    -- 1. Debit Loan Liability account for Principal Reduction
    IF v_principal_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_journal_id, p_loan_account_id, v_principal_amount, 0);
    END IF;

    -- 2. Debit Interest Expense for the fee portion
    IF p_interest_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES (v_journal_id, v_interest_expense_id, p_interest_amount, 0);
    END IF;

    -- 3. Credit Cash/Bank for total cash paid out
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
    VALUES (v_journal_id, p_payment_account_id, 0, p_total_amount);

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;
