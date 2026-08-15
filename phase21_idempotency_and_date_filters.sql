-- phase21_idempotency_and_date_filters.sql
-- Phase 21: Idempotency Protection & Balance Sheet Date Filtering Migration

-- 1. Add source_reference column to journal_entries table for idempotency tracking
ALTER TABLE public.journal_entries 
ADD COLUMN IF NOT EXISTS source_reference TEXT;

-- 2. Add unique constraint on (user_id, source_reference) to prevent duplicate entries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_user_source_reference'
  ) THEN
    ALTER TABLE public.journal_entries 
    ADD CONSTRAINT unique_user_source_reference UNIQUE (user_id, source_reference);
  END IF;
END $$;

-- 3. Update create_journal_entry_atomic RPC with idempotency check
DROP FUNCTION IF EXISTS public.create_journal_entry_atomic(uuid, date, text, jsonb, text);
DROP FUNCTION IF EXISTS public.create_journal_entry_atomic(uuid, date, text, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.create_journal_entry_atomic(
  p_user_id UUID,
  p_date DATE,
  p_description TEXT,
  p_lines JSONB,
  p_created_by_source TEXT DEFAULT 'AI',
  p_source_reference TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_entry_id UUID;
  v_existing_id UUID;
  v_line JSONB;
  v_account_id UUID;
  v_debit NUMERIC := 0;
  v_credit NUMERIC := 0;
  v_debit_cents BIGINT := 0;
  v_credit_cents BIGINT := 0;
  v_line_debit_cents BIGINT;
  v_line_credit_cents BIGINT;
BEGIN
  -- 0. Database-Level Idempotency Check: Prevent duplicate submissions for the same draft_id
  IF p_source_reference IS NOT NULL AND p_source_reference <> '' THEN
    SELECT id INTO v_existing_id
    FROM public.journal_entries
    WHERE user_id = p_user_id AND source_reference = p_source_reference
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  -- 1. Validate p_lines is a JSON array
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Journal entry must contain at least one line item.';
  END IF;

  -- 2. Loop over lines to calculate total debits and credits in cents
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    IF v_line ? 'debit' OR v_line ? 'credit' THEN
      v_debit := COALESCE((v_line->>'debit')::NUMERIC, 0);
      v_credit := COALESCE((v_line->>'credit')::NUMERIC, 0);
    ELSIF v_line ? 'amount' AND v_line ? 'is_debit' THEN
      IF (v_line->>'is_debit')::BOOLEAN = true THEN
        v_debit := COALESCE((v_line->>'amount')::NUMERIC, 0);
        v_credit := 0;
      ELSE
        v_debit := 0;
        v_credit := COALESCE((v_line->>'amount')::NUMERIC, 0);
      END IF;
    ELSE
      v_debit := 0;
      v_credit := 0;
    END IF;

    v_line_debit_cents := ROUND(v_debit * 100);
    v_line_credit_cents := ROUND(v_credit * 100);

    v_debit_cents := v_debit_cents + v_line_debit_cents;
    v_credit_cents := v_credit_cents + v_line_credit_cents;
  END LOOP;

  -- 3. Enforce Double-Entry Balancing Rule (Debits = Credits)
  IF v_debit_cents <> v_credit_cents THEN
    RAISE EXCEPTION 'Unbalanced Journal Entry! Total Debits (% PKR) must equal Total Credits (% PKR).', 
      (v_debit_cents::NUMERIC / 100), (v_credit_cents::NUMERIC / 100);
  END IF;

  IF v_debit_cents <= 0 THEN
    RAISE EXCEPTION 'Journal Entry total amount must be greater than zero.';
  END IF;

  -- 4. Create Parent Journal Entry Record with source_reference
  INSERT INTO public.journal_entries (
    user_id,
    date,
    reference_type,
    reference_id,
    description,
    source_reference
  ) VALUES (
    p_user_id,
    p_date,
    'JOURNAL',
    NULL,
    p_description,
    p_source_reference
  )
  RETURNING id INTO v_journal_entry_id;

  -- 5. Insert Child Journal Line Records
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_account_id := (v_line->>'account_id')::UUID;
    
    IF v_line ? 'debit' OR v_line ? 'credit' THEN
      v_debit := COALESCE((v_line->>'debit')::NUMERIC, 0);
      v_credit := COALESCE((v_line->>'credit')::NUMERIC, 0);
    ELSIF v_line ? 'amount' AND v_line ? 'is_debit' THEN
      IF (v_line->>'is_debit')::BOOLEAN = true THEN
        v_debit := COALESCE((v_line->>'amount')::NUMERIC, 0);
        v_credit := 0;
      ELSE
        v_debit := 0;
        v_credit := COALESCE((v_line->>'amount')::NUMERIC, 0);
      END IF;
    END IF;

    INSERT INTO public.journal_lines (
      journal_entry_id,
      account_id,
      debit,
      credit
    ) VALUES (
      v_journal_entry_id,
      v_account_id,
      v_debit,
      v_credit
    );
  END LOOP;

  RETURN v_journal_entry_id;
END;
$$;
