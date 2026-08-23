-- Phase 29: High-Impact Performance Indexes for Double-Entry Ledger & Financial Reports

-- 1. Accelerate General Ledger, T-Account, and Balance Sheet queries
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_debit_credit 
ON public.journal_lines (account_id, debit, credit);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_entry_id 
ON public.journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date 
ON public.journal_entries (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reference 
ON public.journal_entries (reference_type, reference_id);

-- 2. Accelerate Invoices, Bills, and Customer/Supplier Aging Lookups
CREATE INDEX IF NOT EXISTS idx_invoices_user_verified_created 
ON public.invoices (user_id, is_ai_verified, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status 
ON public.invoices (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id 
ON public.invoice_lines (invoice_id);

CREATE INDEX IF NOT EXISTS idx_bills_user_verified_created 
ON public.bills (user_id, is_ai_verified, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bills_supplier_status 
ON public.bills (supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_bill_lines_bill_id 
ON public.bill_lines (bill_id);

-- 3. Accelerate Accounts & Cash Book Lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_type_cash 
ON public.accounts (user_id, type, is_cash_account);
