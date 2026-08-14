-- phase19_dynamic_cashbook_migration.sql
-- 1. Add is_cash_account column to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS is_cash_account BOOLEAN DEFAULT false;

-- 2. Update existing default bank/cash accounts
UPDATE public.accounts 
SET is_cash_account = true 
WHERE name IN ('Main Bank Account', 'Petty Cash');

-- 3. Update initialize_default_accounts function to include is_cash_account
CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO accounts (user_id, name, type, is_system, is_cash_account)
  SELECT d.user_id, d.name, d.type, true, d.is_cash
  FROM (
    VALUES 
      -- Assets
      (p_user_id, 'Main Bank Account', 'asset', true),
      (p_user_id, 'Petty Cash', 'asset', true),
      (p_user_id, 'Accounts Receivable', 'asset', false),
      (p_user_id, 'Inventory Asset', 'asset', false),
      -- Liabilities
      (p_user_id, 'Accounts Payable', 'liability', false),
      -- Equity
      (p_user_id, 'Owners Equity', 'equity', false),
      -- Revenue
      (p_user_id, 'Sales Revenue', 'revenue', false),
      (p_user_id, 'Service Revenue', 'revenue', false),
      -- Expenses
      (p_user_id, 'Cost of Goods Sold', 'expense', false),
      (p_user_id, 'Rent Expense', 'expense', false),
      (p_user_id, 'Utilities', 'expense', false),
      (p_user_id, 'Software & Hosting', 'expense', false),
      (p_user_id, 'General Operating Expense', 'expense', false)
  ) AS d(user_id, name, type, is_cash)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = d.user_id AND a.name = d.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
