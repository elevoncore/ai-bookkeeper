-- Phase 28: Permanent Walk-in Customer Seeding (CUST-WALKIN)

-- 1. Ensure code column exists on customers table
ALTER TABLE IF EXISTS customers 
ADD COLUMN IF NOT EXISTS code TEXT;

-- 2. Seed Walk-in Customer for all existing users if not present
DO $$
DECLARE
    user_rec RECORD;
BEGIN
    FOR user_rec IN SELECT DISTINCT user_id FROM accounts LOOP
        IF NOT EXISTS (
            SELECT 1 FROM customers 
            WHERE user_id = user_rec.user_id 
              AND (name = 'Walk-in Customer' OR code = 'CUST-WALKIN')
        ) THEN
            INSERT INTO customers (user_id, name, code, email, phone, created_by_source)
            VALUES (user_rec.user_id, 'Walk-in Customer', 'CUST-WALKIN', 'walkin@customer.local', '-', 'SYSTEM');
        ELSE
            UPDATE customers 
            SET code = 'CUST-WALKIN',
                created_by_source = 'SYSTEM'
            WHERE user_id = user_rec.user_id 
              AND (name = 'Walk-in Customer' OR code = 'CUST-WALKIN');
        END IF;
    END LOOP;
END $$;
