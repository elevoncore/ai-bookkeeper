-- phase15_auditability.sql
-- Task 1: Auditability & Tracing (Origin Tracking & Manual Edit Flags)

-- 1. Database Schema Additions
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by_source TEXT DEFAULT 'MANUAL';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN DEFAULT FALSE;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS created_by_source TEXT DEFAULT 'MANUAL';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN DEFAULT FALSE;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_source TEXT DEFAULT 'MANUAL';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN DEFAULT FALSE;

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS created_by_source TEXT DEFAULT 'MANUAL';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN DEFAULT FALSE;

ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by_source TEXT DEFAULT 'MANUAL';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN DEFAULT FALSE;

-- 2. Update Invoice Atomic Creation Function (Origin Tracking)
CREATE OR REPLACE FUNCTION create_invoice_with_lines_atomic(
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
  p_created_by_source TEXT DEFAULT 'MANUAL'
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
    COALESCE(p_created_by_source, 'MANUAL'), false
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id, product_id, description, quantity, unit_price, total,
      currency_code, exchange_rate
    )
    VALUES (
      v_invoice_id, 
      NULLIF(v_item->>'product_id', '')::UUID, 
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

-- 3. Update Bill Atomic Creation Function (Origin Tracking)
CREATE OR REPLACE FUNCTION create_bill_with_lines_atomic(
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB,
  p_currency_code TEXT DEFAULT 'PKR',
  p_exchange_rate NUMERIC DEFAULT 1.0,
  p_original_amount NUMERIC DEFAULT NULL,
  p_created_by_source TEXT DEFAULT 'MANUAL'
) RETURNS UUID AS $$
DECLARE
  v_bill_id UUID;
  v_item JSONB;
BEGIN
  INSERT INTO bills (
    user_id, supplier_id, issue_date, due_date, status, 
    total_amount, balance_due, is_ai_verified, receipt_url,
    currency_code, exchange_rate, original_amount,
    created_by_source, is_manually_edited
  )
  VALUES (
    p_user_id, p_supplier_id, p_issue_date, p_due_date, p_status, 
    p_total_amount, CASE WHEN p_status = 'paid' THEN 0 ELSE p_total_amount END, false, p_receipt_url,
    COALESCE(p_currency_code, 'PKR'), COALESCE(p_exchange_rate, 1.0), COALESCE(p_original_amount, p_total_amount),
    COALESCE(p_created_by_source, 'MANUAL'), false
  )
  RETURNING id INTO v_bill_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (
      bill_id, account_id, product_id, quantity, unit_price, description, amount,
      currency_code, exchange_rate
    )
    VALUES (
      v_bill_id, 
      NULLIF(v_item->>'account_id', '')::UUID,
      NULLIF(v_item->>'product_id', '')::UUID,
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'amount')::NUMERIC),
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC,
      COALESCE(p_currency_code, 'PKR'),
      COALESCE(p_exchange_rate, 1.0)
    );
  END LOOP;

  RETURN v_bill_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Atomic Update Invoice Function (Flag Manual Edit)
CREATE OR REPLACE FUNCTION update_invoice_atomic(
  p_invoice_id UUID,
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
  p_original_amount NUMERIC DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_je_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_cogs_account_id UUID;
  v_inventory_account_id UUID;
  v_cogs_amount NUMERIC := 0;
  rec RECORD;
BEGIN
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM invoices WHERE id = p_invoice_id AND user_id = p_user_id;

  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  IF v_is_verified THEN
     DELETE FROM journal_entries WHERE reference_id = p_invoice_id AND reference_type = 'invoice';
     
     -- Revert stock ONLY for tracked inventory products
     FOR rec IN SELECT il.product_id, il.quantity FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = p_invoice_id AND p.is_inventory_tracked = true LOOP
         UPDATE products SET inventory_count = inventory_count + rec.quantity WHERE id = rec.product_id;
     END LOOP;
  END IF;

  UPDATE invoices SET 
    customer_id = p_customer_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url),
    currency_code = COALESCE(p_currency_code, currency_code),
    exchange_rate = COALESCE(p_exchange_rate, exchange_rate),
    original_amount = COALESCE(p_original_amount, original_amount),
    is_manually_edited = true
  WHERE id = p_invoice_id AND user_id = p_user_id;

  DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (
      invoice_id, product_id, description, quantity, unit_price, total,
      currency_code, exchange_rate
    )
    VALUES (
      p_invoice_id, 
      NULLIF(v_item->>'product_id', '')::UUID, 
      v_item->>'description', 
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC,
      COALESCE(p_currency_code, 'PKR'),
      COALESCE(p_exchange_rate, 1.0)
    );
  END LOOP;

  IF v_is_verified THEN
     SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
     SELECT id INTO v_revenue_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;
     SELECT id INTO v_cogs_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Cost of Goods Sold' LIMIT 1;
     SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

     SELECT SUM(il.quantity * p.cost) INTO v_cogs_amount FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = p_invoice_id AND p.is_inventory_tracked = true;
     v_cogs_amount := COALESCE(v_cogs_amount, 0);

     INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
     VALUES (p_user_id, p_issue_date, 'Invoice ' || p_invoice_id, 'invoice', p_invoice_id)
     RETURNING id INTO v_je_id;

     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_ar_account_id, p_total_amount, 0);
     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_revenue_account_id, 0, p_total_amount);
     
     IF v_cogs_amount > 0 THEN
         INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_cogs_account_id, v_cogs_amount, 0);
         INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_inventory_account_id, 0, v_cogs_amount);
     END IF;

     FOR rec IN SELECT il.product_id, il.quantity FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = p_invoice_id AND p.is_inventory_tracked = true LOOP
         UPDATE products SET inventory_count = inventory_count - rec.quantity WHERE id = rec.product_id;
     END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Atomic Update Bill Function (Flag Manual Edit)
CREATE OR REPLACE FUNCTION update_bill_atomic(
  p_bill_id UUID,
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB,
  p_currency_code TEXT DEFAULT 'PKR',
  p_exchange_rate NUMERIC DEFAULT 1.0,
  p_original_amount NUMERIC DEFAULT NULL
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

  UPDATE bills SET 
    supplier_id = p_supplier_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url),
    currency_code = COALESCE(p_currency_code, currency_code),
    exchange_rate = COALESCE(p_exchange_rate, exchange_rate),
    original_amount = COALESCE(p_original_amount, original_amount),
    is_manually_edited = true
  WHERE id = p_bill_id AND user_id = p_user_id;

  DELETE FROM bill_lines WHERE bill_id = p_bill_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (
      bill_id, account_id, product_id, quantity, unit_price, description, amount,
      currency_code, exchange_rate
    )
    VALUES (
      p_bill_id, 
      NULLIF(v_item->>'account_id', '')::UUID,
      NULLIF(v_item->>'product_id', '')::UUID,
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'amount')::NUMERIC),
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC,
      COALESCE(p_currency_code, 'PKR'),
      COALESCE(p_exchange_rate, 1.0)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
