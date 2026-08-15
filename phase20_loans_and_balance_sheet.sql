-- phase20_loans_and_balance_sheet.sql
-- Phase 20: Loans Workflow & Official Balance Sheet Report
-- 1. Update initialize_default_accounts function to seed Loan Payable & Interest Expense

CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Ensure accounts table has optional is_cash_account column
  -- Insert default chart of accounts
  INSERT INTO accounts (user_id, name, type, is_system)
  SELECT d.user_id, d.name, d.type, true
  FROM (
    VALUES 
      -- Assets
      (p_user_id, 'Main Bank Account', 'asset'),
      (p_user_id, 'Petty Cash', 'asset'),
      (p_user_id, 'Accounts Receivable', 'asset'),
      (p_user_id, 'Inventory Asset', 'asset'),
      -- Liabilities
      (p_user_id, 'Accounts Payable', 'liability'),
      (p_user_id, 'Loan Payable', 'liability'),
      -- Equity
      (p_user_id, 'Owners Equity', 'equity'),
      -- Revenue
      (p_user_id, 'Sales Revenue', 'revenue'),
      (p_user_id, 'Service Revenue', 'revenue'),
      -- Expenses
      (p_user_id, 'Cost of Goods Sold', 'expense'),
      (p_user_id, 'Rent Expense', 'expense'),
      (p_user_id, 'Utilities', 'expense'),
      (p_user_id, 'Software & Hosting', 'expense'),
      (p_user_id, 'Interest Expense', 'expense'),
      (p_user_id, 'General Operating Expense', 'expense')
  ) AS d(user_id, name, type)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = d.user_id AND a.name = d.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Seed Loan Payable & Interest Expense for all existing users in the system
INSERT INTO accounts (user_id, name, type, is_system)
SELECT DISTINCT user_id, 'Loan Payable', 'liability', true
FROM accounts
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a2 WHERE a2.user_id = accounts.user_id AND a2.name = 'Loan Payable'
);

INSERT INTO accounts (user_id, name, type, is_system)
SELECT DISTINCT user_id, 'Interest Expense', 'expense', true
FROM accounts
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a2 WHERE a2.user_id = accounts.user_id AND a2.name = 'Interest Expense'
);
