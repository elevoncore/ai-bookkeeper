-- =========================================================================
-- PHASE 39: DROP LEGACY GHOST TRIGGERS (FIX DUPLICATE INVENTORY/COGS CALCULATIONS)
-- =========================================================================
-- Context: Legacy triggers `on_bill_verified` and `on_invoice_verified` from schema_updates.sql
-- executed the same function alongside `trg_bill_verification` and `trg_invoice_verification`,
-- causing stock movements and COGS calculations to execute twice per transaction.

DROP TRIGGER IF EXISTS on_bill_verified ON public.bills;
DROP TRIGGER IF EXISTS on_invoice_verified ON public.invoices;
