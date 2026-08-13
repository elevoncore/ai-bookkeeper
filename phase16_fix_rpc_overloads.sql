-- phase16_fix_rpc_overloads.sql
-- 1. Drop existing overloaded variations for Invoice Atomic RPC
DROP FUNCTION IF EXISTS public.create_invoice_with_lines_atomic(uuid, uuid, date, date, text, numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.create_invoice_with_lines_atomic(uuid, uuid, date, date, text, numeric, text, jsonb, text, numeric, numeric);

-- 2. Drop existing overloaded variations for Bill Atomic RPC
DROP FUNCTION IF EXISTS public.create_bill_with_lines_atomic(uuid, uuid, date, date, text, numeric, text, jsonb);
DROP FUNCTION IF EXISTS public.create_bill_with_lines_atomic(uuid, uuid, date, date, text, numeric, text, jsonb, text, numeric, numeric);

-- 3. Recreate the Unified Master Function for Invoices
CREATE OR REPLACE FUNCTION public.create_invoice_with_lines_atomic(
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
  p_created_by_source TEXT DEFAULT 'AI'
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
    COALESCE(p_created_by_source, 'AI'), false
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

-- 4. Recreate the Unified Master Function for Bills
CREATE OR REPLACE FUNCTION public.create_bill_with_lines_atomic(
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
  p_created_by_source TEXT DEFAULT 'AI'
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
    COALESCE(p_created_by_source, 'AI'), false
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
