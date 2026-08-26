-- Phase 32: Emergency Schema Patch & Schema Cache Refresh
-- Ensures is_advance, applied_invoice_id, applied_bill_id, and notes columns exist on payments tables

DO $$
BEGIN
  -- payments_received schema enhancements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments_received') THEN
    ALTER TABLE public.payments_received ALTER COLUMN invoice_id DROP NOT NULL;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS is_advance BOOLEAN DEFAULT false;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS applied_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
    ALTER TABLE public.payments_received ADD COLUMN IF NOT EXISTS notes TEXT;
  END IF;

  -- payments_made schema enhancements
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments_made') THEN
    ALTER TABLE public.payments_made ALTER COLUMN bill_id DROP NOT NULL;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS is_advance BOOLEAN DEFAULT false;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS applied_bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL;
    ALTER TABLE public.payments_made ADD COLUMN IF NOT EXISTS notes TEXT;
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
