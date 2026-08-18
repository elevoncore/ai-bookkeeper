-- Phase 23: Sub-Accounts Seed Expansion & AI Brain Upgrade
-- Seeding Owner Drawings, Retained Earnings, Fixed Assets, and Sales Tax Payable

CREATE OR REPLACE FUNCTION initialize_default_accounts(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Assets
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Main Bank Account', '1010', 'asset', true, true),
    (p_user_id, 'Petty Cash', '1020', 'asset', true, true),
    (p_user_id, 'Accounts Receivable', '1200', 'asset', true, false),
    (p_user_id, 'Inventory Asset', '1300', 'asset', true, false),
    (p_user_id, 'Fixed Assets - Equipment/Furniture', '1510', 'asset', true, false)
  ON CONFLICT (user_id, name) DO NOTHING;

  -- Liabilities
  INSERT INTO accounts (user_id, name, code, type, is_system, is_cash_account)
  VALUES 
    (p_user_id, 'Accounts Payable', '2010', 'liability', true, false),
    (p_user_id, 'Sales Tax Payable', '2020', 'liability', true, false),
    (p_user_id, 'Loan Payable', '2500', 'liability', true, false)
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
