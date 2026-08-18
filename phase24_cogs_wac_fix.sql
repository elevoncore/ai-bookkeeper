-- phase24_cogs_wac_fix.sql
-- Fix WAC stock calculation so negative stock counts don't skew unit cost calculations

CREATE OR REPLACE FUNCTION trg_bill_verification() RETURNS TRIGGER AS $$
DECLARE
    v_ap_account_id UUID;
    v_inventory_account_id UUID;
    v_je_id UUID;
    rec RECORD;
    v_target_account UUID;
    v_curr_stock NUMERIC;
    v_curr_cost NUMERIC;
    v_new_stock NUMERIC;
    v_new_cost NUMERIC;
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

        FOR rec IN SELECT bl.*, p.is_inventory_tracked, p.inventory_count, p.cost FROM bill_lines bl LEFT JOIN products p ON p.id = bl.product_id WHERE bl.bill_id = NEW.id LOOP
            IF rec.is_inventory_tracked = true THEN
                v_target_account := v_inventory_account_id;
                
                v_curr_stock := GREATEST(0, COALESCE(rec.inventory_count, 0));
                v_curr_cost := COALESCE(rec.cost, 0);
                v_new_stock := v_curr_stock + rec.quantity;
                
                IF v_new_stock > 0 THEN
                    v_new_cost := ((v_curr_stock * v_curr_cost) + COALESCE(rec.amount, 0)) / v_new_stock;
                ELSE
                    v_new_cost := v_curr_cost;
                END IF;

                UPDATE products SET inventory_count = v_new_stock, cost = v_new_cost WHERE id = rec.product_id;
            ELSE
                v_target_account := rec.account_id;
            END IF;

            INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
            VALUES (v_je_id, v_target_account, COALESCE(rec.amount, 0), 0);
        END LOOP;

        INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit) 
        VALUES (v_je_id, v_ap_account_id, 0, NEW.total_amount);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
