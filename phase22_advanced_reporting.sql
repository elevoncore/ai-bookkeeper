-- phase22_advanced_reporting.sql
-- Phase 22: Advanced Time-Series Reporting & Global Table Filtering Indexes

-- 1. Create helper index on journal_entries date for high-performance time-bucket querying
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON public.journal_entries (user_id, date DESC);

-- 2. Create helper index on invoices and bills for status and created_at filtering
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON public.invoices (user_id, status, is_ai_verified);
CREATE INDEX IF NOT EXISTS idx_bills_user_status ON public.bills (user_id, status, is_ai_verified);
