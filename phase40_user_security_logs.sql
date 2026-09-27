-- =========================================================================
-- PHASE 40: USER SECURITY LOGS & BRUTE-FORCE FIREWALL SCHEMA
-- =========================================================================
-- Context: Implements custom brute-force protection, account lockouts,
-- and strict OTP rate limits (3 requests per 24 hours) for Next.js / Supabase Auth.

CREATE TABLE IF NOT EXISTS public.user_security_logs (
    email TEXT PRIMARY KEY,
    failed_login_attempts INTEGER DEFAULT 0 NOT NULL,
    locked_until TIMESTAMPTZ,
    otp_requests_today INTEGER DEFAULT 0 NOT NULL,
    last_otp_request TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for rapid lockout verification
CREATE INDEX IF NOT EXISTS idx_user_security_logs_locked_until 
    ON public.user_security_logs (locked_until);

-- Enable Row Level Security
ALTER TABLE public.user_security_logs ENABLE ROW LEVEL SECURITY;

-- Allow public / anon and authenticated access for the auth middleware firewall
DROP POLICY IF EXISTS "Public auth firewall access" ON public.user_security_logs;
CREATE POLICY "Public auth firewall access"
    ON public.user_security_logs
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- Grant privileges
GRANT ALL ON TABLE public.user_security_logs TO anon, authenticated, service_role;

-- =========================================================================
-- ATOMIC SECURITY STORED PROCEDURES (RPCs)
-- =========================================================================

-- 1. Check Login Lockout Status
CREATE OR REPLACE FUNCTION public.check_login_lockout(p_email TEXT)
RETURNS TABLE (
    is_locked BOOLEAN,
    locked_until TIMESTAMPTZ,
    failed_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log public.user_security_logs%ROWTYPE;
BEGIN
    SELECT * INTO v_log FROM public.user_security_logs WHERE email = LOWER(TRIM(p_email));
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 0;
        RETURN;
    END IF;

    -- If locked_until is set and in the future, account is locked
    IF v_log.locked_until IS NOT NULL AND v_log.locked_until > now() THEN
        RETURN QUERY SELECT TRUE, v_log.locked_until, v_log.failed_login_attempts;
        RETURN;
    END IF;

    -- If lockout expired, reset lockout state
    IF v_log.locked_until IS NOT NULL AND v_log.locked_until <= now() THEN
        UPDATE public.user_security_logs
        SET locked_until = NULL, failed_login_attempts = 0, updated_at = now()
        WHERE email = LOWER(TRIM(p_email));
        
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, 0;
        RETURN;
    END IF;

    RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, v_log.failed_login_attempts;
END;
$$;

-- 2. Record Login Failure (3-Strike Rule)
CREATE OR REPLACE FUNCTION public.record_login_failure(p_email TEXT)
RETURNS TABLE (
    is_locked BOOLEAN,
    locked_until TIMESTAMPTZ,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(p_email));
    v_attempts INTEGER;
    v_locked_until TIMESTAMPTZ := NULL;
BEGIN
    INSERT INTO public.user_security_logs (email, failed_login_attempts, updated_at)
    VALUES (v_clean_email, 1, now())
    ON CONFLICT (email) DO UPDATE
    SET failed_login_attempts = public.user_security_logs.failed_login_attempts + 1,
        updated_at = now()
    RETURNING failed_login_attempts INTO v_attempts;

    IF v_attempts >= 3 THEN
        v_locked_until := now() + INTERVAL '24 hours';
        UPDATE public.user_security_logs
        SET locked_until = v_locked_until,
            updated_at = now()
        WHERE email = v_clean_email;

        RETURN QUERY SELECT TRUE, v_locked_until, v_attempts;
    ELSE
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, v_attempts;
    END IF;
END;
$$;

-- 3. Record Login Success (Reset Failures)
CREATE OR REPLACE FUNCTION public.record_login_success(p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.user_security_logs
    SET failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = now()
    WHERE email = LOWER(TRIM(p_email));
END;
$$;

-- 4. Check and Record OTP Request Rate Limit (Max 3 in 24h)
CREATE OR REPLACE FUNCTION public.check_and_record_otp_request(p_email TEXT)
RETURNS TABLE (
    allowed BOOLEAN,
    requests_today INTEGER,
    message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_email TEXT := LOWER(TRIM(p_email));
    v_log public.user_security_logs%ROWTYPE;
    v_requests INTEGER := 0;
BEGIN
    SELECT * INTO v_log FROM public.user_security_logs WHERE email = v_clean_email;

    IF NOT FOUND THEN
        INSERT INTO public.user_security_logs (email, otp_requests_today, last_otp_request, updated_at)
        VALUES (v_clean_email, 1, now(), now());
        RETURN QUERY SELECT TRUE, 1, 'OTP request allowed'::TEXT;
        RETURN;
    END IF;

    -- Reset counter if 24 hours have elapsed since last OTP request
    IF v_log.last_otp_request IS NULL OR v_log.last_otp_request < (now() - INTERVAL '24 hours') THEN
        UPDATE public.user_security_logs
        SET otp_requests_today = 1,
            last_otp_request = now(),
            updated_at = now()
        WHERE email = v_clean_email;
        RETURN QUERY SELECT TRUE, 1, 'OTP request allowed (counter reset)'::TEXT;
        RETURN;
    END IF;

    -- Block if already reached 3 requests within 24 hours
    IF v_log.otp_requests_today >= 3 THEN
        RETURN QUERY SELECT FALSE, v_log.otp_requests_today, 'Maximum OTP limit reached (3 requests per 24 hours). Please try again tomorrow.'::TEXT;
        RETURN;
    END IF;

    -- Otherwise increment
    UPDATE public.user_security_logs
    SET otp_requests_today = v_log.otp_requests_today + 1,
        last_otp_request = now(),
        updated_at = now()
    WHERE email = v_clean_email
    RETURNING otp_requests_today INTO v_requests;

    RETURN QUERY SELECT TRUE, v_requests, 'OTP request allowed'::TEXT;
END;
$$;
