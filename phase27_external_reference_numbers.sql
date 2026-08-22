-- Phase 27: External Reference Numbers & Walk-in Customer Support

-- 1. Add external_reference_number to bills, invoices, and journal_entries
ALTER TABLE IF EXISTS bills 
ADD COLUMN IF NOT EXISTS external_reference_number TEXT;

ALTER TABLE IF EXISTS invoices 
ADD COLUMN IF NOT EXISTS external_reference_number TEXT;

ALTER TABLE IF EXISTS journal_entries 
ADD COLUMN IF NOT EXISTS external_reference_number TEXT;

-- 2. Indexes for fast lookup by external reference number
CREATE INDEX IF NOT EXISTS idx_bills_external_ref ON bills(user_id, external_reference_number);
CREATE INDEX IF NOT EXISTS idx_invoices_external_ref ON invoices(user_id, external_reference_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_external_ref ON journal_entries(user_id, external_reference_number);

-- 3. Ensure Walk-in Customer support
COMMENT ON COLUMN bills.external_reference_number IS 'Vendor receipt or invoice number from the external supplier';
COMMENT ON COLUMN invoices.external_reference_number IS 'External reference number or POS receipt identifier';
COMMENT ON COLUMN journal_entries.external_reference_number IS 'External source reference or banking reference number';
