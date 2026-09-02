-- =========================================================================
-- PHASE 37: DEBT HIERARCHY, CONTROL CATEGORIES & DATA SANITIZATION
-- =========================================================================

-- 1. Ensure parent_account_id and parent_id columns exist on accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_id UUID REFERENCES accounts(id);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES accounts(id);

-- 2. Data Sanitization: Ensure NO liability or non-asset account has is_cash_account = true
UPDATE accounts SET is_cash_account = false WHERE type = 'liability';
UPDATE accounts SET is_cash_account = false WHERE type != 'asset';

-- 3. Update initialize_default_accounts to seed Short-Term Debt and Long-Term Debt
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

  -- Liabilities (Control categories: Short-Term Debt & Long-Term Debt)
  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Accounts Payable', 'liability', true, false),
    (p_user_id, 'Customer Advances / Unearned Revenue', 'liability', true, false),
    (p_user_id, 'Sales Tax Payable', 'liability', true, false),
    (p_user_id, 'Short-Term Debt', 'liability', true, false),
    (p_user_id, 'Long-Term Debt', 'liability', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Equity (SME / Sole Proprietorship structure)
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

-- 4. Database Clean-up & Migration of Legacy Loan Accounts
DO $$
DECLARE
  r RECORD;
  v_st_debt_id UUID;
  v_lt_debt_id UUID;
  v_old_lp_id UUID;
  v_old_lt_id UUID;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM accounts LOOP
    -- Ensure default accounts exist for user
    PERFORM initialize_default_accounts(r.user_id);

    -- Get Control Account IDs
    SELECT id INTO v_st_debt_id FROM accounts WHERE user_id = r.user_id AND name = 'Short-Term Debt' LIMIT 1;
    SELECT id INTO v_lt_debt_id FROM accounts WHERE user_id = r.user_id AND name = 'Long-Term Debt' LIMIT 1;
    SELECT id INTO v_old_lp_id FROM accounts WHERE user_id = r.user_id AND name = 'Loan Payable' LIMIT 1;
    SELECT id INTO v_old_lt_id FROM accounts WHERE user_id = r.user_id AND name = 'Long-Term Loan Payable' LIMIT 1;

    -- Create Short-Term Debt control category if missing
    IF v_st_debt_id IS NULL THEN
      INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
      VALUES (r.user_id, 'Short-Term Debt', 'liability', true, false)
      RETURNING id INTO v_st_debt_id;
    END IF;

    -- Create Long-Term Debt control category if missing
    IF v_lt_debt_id IS NULL THEN
      INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
      VALUES (r.user_id, 'Long-Term Debt', 'liability', true, false)
      RETURNING id INTO v_lt_debt_id;
    END IF;

    -- Update existing specific lender accounts (e.g., Askari Bank, Meezan Bank, etc.)
    -- Point them to Long-Term Debt (or Short-Term Debt if specified)
    UPDATE accounts 
    SET parent_account_id = v_lt_debt_id, parent_id = v_lt_debt_id, is_cash_account = false
    WHERE user_id = r.user_id 
      AND type = 'liability' 
      AND is_system = false 
      AND (parent_account_id IS NULL AND parent_id IS NULL OR parent_id = v_old_lt_id OR parent_account_id = v_old_lt_id);

    UPDATE accounts 
    SET parent_account_id = v_st_debt_id, parent_id = v_st_debt_id, is_cash_account = false
    WHERE user_id = r.user_id 
      AND type = 'liability' 
      AND is_system = false 
      AND (parent_id = v_old_lp_id OR parent_account_id = v_old_lp_id);

    -- Migrate journal lines from legacy generic Loan Payable -> Short-Term Debt
    IF v_old_lp_id IS NOT NULL AND v_st_debt_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_st_debt_id WHERE account_id = v_old_lp_id;
      DELETE FROM accounts WHERE id = v_old_lp_id;
    END IF;

    -- Migrate journal lines from legacy generic Long-Term Loan Payable -> Long-Term Debt
    IF v_old_lt_id IS NOT NULL AND v_lt_debt_id IS NOT NULL THEN
      UPDATE journal_lines SET account_id = v_lt_debt_id WHERE account_id = v_old_lt_id;
      DELETE FROM accounts WHERE id = v_old_lt_id;
    END IF;
  END LOOP;
END;
$$;

-- 5. Upgrade receive_loan_atomic RPC with Short-Term Debt / Long-Term Debt control categories
CREATE OR REPLACE FUNCTION receive_loan_atomic(
    p_user_id UUID,
    p_lender_name TEXT,
    p_time_horizon TEXT, -- 'short' or 'long' (<12m or >12m)
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
    IF p_time_horizon = 'short' OR p_time_horizon = '< 12 Months' OR p_time_horizon = 'Short-Term' THEN
        v_parent_name := 'Short-Term Debt';
    ELSE
        v_parent_name := 'Long-Term Debt';
    END IF;

    -- 2. Find or create parent control account
    SELECT id INTO v_parent_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = v_parent_name AND type = 'liability' 
    LIMIT 1;

    IF v_parent_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
        VALUES (p_user_id, v_parent_name, 'liability', true, false)
        RETURNING id INTO v_parent_id;
    END IF;

    -- 3. Create or find specific lender account
    SELECT id INTO v_lender_account_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = p_lender_name AND type = 'liability' 
    LIMIT 1;

    IF v_lender_account_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, parent_account_id, parent_id, is_system, is_cash_account)
        VALUES (p_user_id, p_lender_name, 'liability', v_parent_id, v_parent_id, false, false)
        RETURNING id INTO v_lender_account_id;
    ELSE
        UPDATE accounts 
        SET parent_account_id = v_parent_id, parent_id = v_parent_id, is_cash_account = false 
        WHERE id = v_lender_account_id;
    END IF;

    -- 4. Create balanced journal entry
    INSERT INTO journal_entries (user_id, date, description, reference_type)
    VALUES (p_user_id, p_date, COALESCE(NULLIF(TRIM(p_description), ''), 'Loan Proceeds - ' || p_lender_name), 'LOAN_INFLOW')
    RETURNING id INTO v_je_id;

    -- 5. Debit Bank/Cash | Credit Specific Lender Account
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES 
        (v_je_id, p_bank_account_id, p_amount, 0, COALESCE(NULLIF(TRIM(p_description), ''), 'Loan Proceeds from ' || p_lender_name)),
        (v_je_id, v_lender_account_id, 0, p_amount, COALESCE(NULLIF(TRIM(p_description), ''), 'Loan Obligation - ' || p_lender_name));

    RETURN v_lender_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Upgrade repay_loan_atomic RPC
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
    v_lender_name TEXT;
BEGIN
    v_principal_amount := p_total_payment - p_interest_amount;

    SELECT name INTO v_lender_name FROM accounts WHERE id = p_lender_account_id LIMIT 1;

    -- Find or create Interest Expense account
    SELECT id INTO v_interest_acc_id 
    FROM accounts 
    WHERE user_id = p_user_id AND name = 'Interest Expense' AND type = 'expense' 
    LIMIT 1;

    IF v_interest_acc_id IS NULL THEN
        INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
        VALUES (p_user_id, 'Interest Expense', 'expense', true, false)
        RETURNING id INTO v_interest_acc_id;
    END IF;

    -- Create journal entry
    INSERT INTO journal_entries (user_id, date, description, reference_type)
    VALUES (p_user_id, p_date, COALESCE(NULLIF(TRIM(p_description), ''), 'Loan Repayment - ' || COALESCE(v_lender_name, 'Lender')), 'LOAN_REPAYMENT')
    RETURNING id INTO v_je_id;

    -- Post lines:
    -- Credit Bank/Cash (Total Payment)
    INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, p_bank_account_id, 0, p_total_payment, COALESCE(NULLIF(TRIM(p_description), ''), 'Loan Repayment to ' || COALESCE(v_lender_name, 'Lender')));

    -- Debit Interest Expense (Interest Amount)
    IF p_interest_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES (v_je_id, v_interest_acc_id, p_interest_amount, 0, 'Interest Expense - ' || COALESCE(v_lender_name, 'Lender'));
    END IF;

    -- Debit Specific Lender Account (Principal Amount)
    IF v_principal_amount > 0 THEN
        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit, description)
        VALUES (v_je_id, p_lender_account_id, v_principal_amount, 0, 'Principal Reduction - ' || COALESCE(v_lender_name, 'Lender'));
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
