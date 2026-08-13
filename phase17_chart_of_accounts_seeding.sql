-- phase17_chart_of_accounts_seeding.sql
-- Phase 1: Cashbook & Expanded Ledger - Step 1: Chart of Accounts Seeding Logic

CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

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
      (p_user_id, 'General Operating Expense', 'expense')
  ) AS d(user_id, name, type)
  WHERE NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = d.user_id AND a.name = d.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
