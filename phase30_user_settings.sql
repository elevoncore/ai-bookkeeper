-- Phase 30: User & Tenant ERP Settings Table with RLS

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Karachi',
    accounting_basis VARCHAR(20) NOT NULL DEFAULT 'accrual',
    fiscal_year_start VARCHAR(20) NOT NULL DEFAULT 'July',
    ai_require_manual_verification BOOLEAN NOT NULL DEFAULT true,
    ai_strict_cogs_realization BOOLEAN NOT NULL DEFAULT true,
    ai_ambiguity_strictness VARCHAR(20) NOT NULL DEFAULT 'strict' CHECK (ai_ambiguity_strictness IN ('strict', 'balanced', 'permissive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;

-- Create RLS Policies
CREATE POLICY "Users can view their own settings"
ON public.user_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
ON public.user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
ON public.user_settings FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create Function to Automatically Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trigger_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION update_user_settings_timestamp();
