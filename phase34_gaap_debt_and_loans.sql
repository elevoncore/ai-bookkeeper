-- Phase 34: GAAP Loan Schema Upgrade & Atomic RPCs
-- 1. Add parent_id column to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES accounts(id);

-- 2. Create receive_loan_atomic RPC
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

-- 3. Create repay_loan_atomic RPC
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
