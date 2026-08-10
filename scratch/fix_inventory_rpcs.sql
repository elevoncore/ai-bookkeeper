-- fix_inventory_rpcs.sql
-- Clean, deterministic inventory updates & triggers

CREATE OR REPLACE FUNCTION trg_invoice_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    v_cogs_amount NUMERIC := 0;
    rec RECORD;
BEGIN
    -- Only run on initial verification (transition from false -> true) or INSERT with verified=true
    IF NEW.is_ai_verified = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_ai_verified = false)) THEN
        SELECT id INTO v_ar_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Receivable' LIMIT 1;
        SELECT id INTO v_revenue_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Sales Revenue' LIMIT 1;
        SELECT id INTO v_cogs_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Cost of Goods Sold' LIMIT 1;
        SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

        IF v_cogs_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Cost of Goods Sold', 'expense', true) RETURNING id INTO v_cogs_account_id;
        END IF;
        IF v_inventory_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Inventory Asset', 'asset', true) RETURNING id INTO v_inventory_account_id;
        END IF;

        IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        SELECT SUM(il.quantity * p.cost) INTO v_cogs_amount 
        FROM invoice_lines il 
        JOIN products p ON p.id = il.product_id 
        WHERE il.invoice_id = NEW.id AND p.is_inventory_tracked = true;

        v_cogs_amount := COALESCE(v_cogs_amount, 0);

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Invoice ' || NEW.id, 'invoice', NEW.id)
        RETURNING id INTO v_je_id;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
        VALUES 
            (v_je_id, v_ar_account_id, NEW.total_amount, 0),
            (v_je_id, v_revenue_account_id, 0, NEW.total_amount);
        
        IF v_cogs_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
            VALUES 
                (v_je_id, v_cogs_account_id, v_cogs_amount, 0),
                (v_je_id, v_inventory_account_id, 0, v_cogs_amount);
        END IF;

        -- Deduct stock for initial verification
        FOR rec IN SELECT il.product_id, il.quantity FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = NEW.id AND p.is_inventory_tracked = true LOOP
            UPDATE products SET inventory_count = inventory_count - rec.quantity WHERE id = rec.product_id;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION trg_bill_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ap_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    rec RECORD;
    v_target_account UUID;
BEGIN
    IF NEW.is_ai_verified = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.is_ai_verified = false)) THEN
        SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
        SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = NEW.user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

        IF v_inventory_account_id IS NULL THEN
            INSERT INTO accounts (user_id, name, type, is_system) VALUES (NEW.user_id, 'Inventory Asset', 'asset', true) RETURNING id INTO v_inventory_account_id;
        END IF;

        IF v_ap_account_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
        VALUES (NEW.user_id, NEW.issue_date, 'Bill ' || NEW.id, 'bill', NEW.id)
        RETURNING id INTO v_je_id;

        FOR rec IN SELECT bl.*, p.is_inventory_tracked FROM bill_lines bl LEFT JOIN products p ON p.id = bl.product_id WHERE bl.bill_id = NEW.id LOOP
            IF rec.is_inventory_tracked = true THEN
                v_target_account := v_inventory_account_id;
                UPDATE products SET inventory_count = inventory_count + rec.quantity WHERE id = rec.product_id;
            ELSE
                v_target_account := rec.account_id;
            END IF;

            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
            VALUES (v_je_id, v_target_account, rec.amount, 0);
        END LOOP;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
        VALUES (v_je_id, v_ap_account_id, 0, NEW.total_amount);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION update_invoice_atomic(
  p_invoice_id UUID,
  p_user_id UUID,
  p_customer_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
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

  -- 1. Revert inventory & journal entries if already verified
  IF v_is_verified THEN
     DELETE FROM journal_entries WHERE reference_id = p_invoice_id AND reference_type = 'invoice';
     
     FOR rec IN SELECT il.product_id, il.quantity FROM invoice_lines il JOIN products p ON p.id = il.product_id WHERE il.invoice_id = p_invoice_id AND p.is_inventory_tracked = true LOOP
         UPDATE products SET inventory_count = inventory_count + rec.quantity WHERE id = rec.product_id;
     END LOOP;
  END IF;

  -- 2. Update parent invoice
  UPDATE invoices SET 
    customer_id = p_customer_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_invoice_id AND user_id = p_user_id;

  -- 3. Replace lines
  DELETE FROM invoice_lines WHERE invoice_id = p_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO invoice_lines (invoice_id, product_id, description, quantity, unit_price, total)
    VALUES (
      p_invoice_id, 
      (v_item->>'product_id')::UUID, 
      v_item->>'description', 
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'total')::NUMERIC
    );
  END LOOP;

  -- 4. Re-apply inventory deduction & rebuild journals if verified
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


CREATE OR REPLACE FUNCTION update_bill_atomic(
  p_bill_id UUID,
  p_user_id UUID,
  p_supplier_id UUID,
  p_issue_date DATE,
  p_due_date DATE,
  p_status TEXT,
  p_total_amount NUMERIC,
  p_receipt_url TEXT,
  p_line_items JSONB
) RETURNS VOID AS $$
DECLARE
  v_item JSONB;
  v_is_verified BOOLEAN;
  v_old_total NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
  v_je_id UUID;
  v_ap_account_id UUID;
  v_inventory_account_id UUID;
  rec RECORD;
  v_target_account UUID;
BEGIN
  SELECT is_ai_verified, total_amount, balance_due INTO v_is_verified, v_old_total, v_old_balance 
  FROM bills WHERE id = p_bill_id AND user_id = p_user_id;

  IF p_status = 'paid' THEN
     v_new_balance := 0;
  ELSE
     v_new_balance := p_total_amount - (v_old_total - v_old_balance);
  END IF;

  IF v_is_verified THEN
     DELETE FROM journal_entries WHERE reference_id = p_bill_id AND reference_type = 'bill';
     
     FOR rec IN SELECT bl.product_id, bl.quantity FROM bill_lines bl JOIN products p ON p.id = bl.product_id WHERE bl.bill_id = p_bill_id AND p.is_inventory_tracked = true LOOP
         UPDATE products SET inventory_count = inventory_count - rec.quantity WHERE id = rec.product_id;
     END LOOP;
  END IF;

  UPDATE bills SET 
    supplier_id = p_supplier_id,
    issue_date = p_issue_date,
    due_date = p_due_date,
    status = p_status,
    total_amount = p_total_amount,
    balance_due = v_new_balance,
    receipt_url = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_bill_id AND user_id = p_user_id;

  DELETE FROM bill_lines WHERE bill_id = p_bill_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO bill_lines (bill_id, account_id, product_id, quantity, unit_price, description, amount)
    VALUES (
      p_bill_id, 
      NULLIF(v_item->>'account_id', '')::UUID,
      NULLIF(v_item->>'product_id', '')::UUID,
      COALESCE((v_item->>'quantity')::NUMERIC, 1),
      COALESCE((v_item->>'unit_price')::NUMERIC, (v_item->>'amount')::NUMERIC),
      v_item->>'description', 
      (v_item->>'amount')::NUMERIC
    );
  END LOOP;

  IF v_is_verified THEN
     SELECT id INTO v_ap_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Accounts Payable' LIMIT 1;
     SELECT id INTO v_inventory_account_id FROM accounts WHERE user_id = p_user_id AND is_system = true AND name = 'Inventory Asset' LIMIT 1;

     INSERT INTO journal_entries (user_id, date, description, reference_type, reference_id)
     VALUES (p_user_id, p_issue_date, 'Bill ' || p_bill_id, 'bill', p_bill_id)
     RETURNING id INTO v_je_id;

     FOR rec IN SELECT bl.*, p.is_inventory_tracked FROM bill_lines bl LEFT JOIN products p ON p.id = bl.product_id WHERE bl.bill_id = p_bill_id LOOP
         IF rec.is_inventory_tracked = true THEN
             v_target_account := v_inventory_account_id;
             UPDATE products SET inventory_count = inventory_count + rec.quantity WHERE id = rec.product_id;
         ELSE
             v_target_account := rec.account_id;
         END IF;
         INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_target_account, rec.amount, 0);
     END LOOP;

     INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) VALUES (v_je_id, v_ap_account_id, 0, p_total_amount);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
