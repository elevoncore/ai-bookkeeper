-- phase12_inventory_reconciliation.sql
-- Periodic Stocktake & Inventory Discrepancy Reconciliation RPC

CREATE OR REPLACE FUNCTION reconcile_inventory_atomic(
  p_user_id UUID,
  p_product_id UUID,
  p_actual_stock_count NUMERIC,
  p_reason TEXT DEFAULT 'Stocktake adjustment'
) RETURNS VOID AS $$
DECLARE
  v_current_stock NUMERIC;
  v_current_cost NUMERIC;
  v_product_name TEXT;
  v_variance NUMERIC;
  v_variance_value NUMERIC;
  v_inventory_account_id UUID;
  v_variance_account_id UUID;
  v_je_id UUID;
BEGIN
  -- 1. Fetch current product information
  SELECT inventory_count, cost, name 
  INTO v_current_stock, v_current_cost, v_product_name
  FROM products 
  WHERE id = p_product_id AND user_id = p_user_id;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Product with ID % not found for user %', p_product_id, p_user_id;
  END IF;

  v_current_stock := COALESCE(v_current_stock, 0);
  v_current_cost := COALESCE(v_current_cost, 0);

  -- 2. Calculate variance and monetary value
  v_variance := p_actual_stock_count - v_current_stock;
  v_variance_value := ABS(v_variance * v_current_cost);

  -- 3. Update stock count in products table
  UPDATE products 
  SET inventory_count = p_actual_stock_count 
  WHERE id = p_product_id AND user_id = p_user_id;

  -- 4. Post double-entry journal lines if monetary variance exists
  IF v_variance <> 0 AND v_variance_value > 0 THEN
    -- Ensure system accounts exist
    SELECT id INTO v_inventory_account_id 
    FROM accounts 
    WHERE user_id = p_user_id AND is_system = true AND name = 'Inventory Asset' 
    LIMIT 1;

    IF v_inventory_account_id IS NULL THEN
      INSERT INTO accounts (user_id, name, type, is_system) 
      VALUES (p_user_id, 'Inventory Asset', 'asset', true) 
      RETURNING id INTO v_inventory_account_id;
    END IF;

    SELECT id INTO v_variance_account_id 
    FROM accounts 
    WHERE user_id = p_user_id AND is_system = true AND name = 'Inventory Shrinkage/Variance Expense' 
    LIMIT 1;

    IF v_variance_account_id IS NULL THEN
      INSERT INTO accounts (user_id, name, type, is_system) 
      VALUES (p_user_id, 'Inventory Shrinkage/Variance Expense', 'expense', true) 
      RETURNING id INTO v_variance_account_id;
    END IF;

    -- Create Journal Entry header
    INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
    VALUES (
      p_user_id, 
      CURRENT_DATE, 
      COALESCE(p_reason, 'Inventory Adjustment: ') || ' - ' || v_product_name, 
      'inventory_adjustment', 
      p_product_id
    )
    RETURNING id INTO v_je_id;

    -- Double-Entry Ledger Logic:
    IF v_variance > 0 THEN
      -- Surplus: Increase Asset (Debit), Reduce Expense (Credit)
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
      VALUES 
        (v_je_id, v_inventory_account_id, v_variance_value, 0),
        (v_je_id, v_variance_account_id, 0, v_variance_value);
    ELSE
      -- Shrinkage/Waste: Increase Expense (Debit), Reduce Asset (Credit)
      INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
      VALUES 
        (v_je_id, v_variance_account_id, v_variance_value, 0),
        (v_je_id, v_inventory_account_id, 0, v_variance_value);
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
