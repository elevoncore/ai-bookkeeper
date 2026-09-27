'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// In-memory security cache layer (reinforces database state and ensures zero-gap enforcement)
interface MemorySecurityRecord {
  failedAttempts: number;
  lockedUntil: number | null;
  otpRequestsToday: number;
  lastOtpRequest: number | null;
}

const memorySecurityStore = new Map<string, MemorySecurityRecord>();

function getMemoryRecord(email: string): MemorySecurityRecord {
  const existing = memorySecurityStore.get(email);
  if (existing) return existing;
  const initial: MemorySecurityRecord = {
    failedAttempts: 0,
    lockedUntil: null,
    otpRequestsToday: 0,
    lastOtpRequest: null,
  };
  memorySecurityStore.set(email, initial);
  return initial;
}

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (e) {
            console.error("Failed to set auth cookies:", e);
          }
        },
      },
    }
  );
}

// =========================================================================
// SECURITY FIREWALL HELPERS (BRUTE-FORCE & OTP RATE-LIMIT)
// =========================================================================

export async function checkLoginLockout(email: string): Promise<{ isLocked: boolean; error?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  const supabase = await getSupabaseServerClient();
  const now = Date.now();

  // 1. Check in-memory fast cache first
  const mem = getMemoryRecord(cleanEmail);
  if (mem.lockedUntil && mem.lockedUntil > now) {
    return {
      isLocked: true,
      error: "Too many attempts. Account locked for 24 hours",
    };
  } else if (mem.lockedUntil && mem.lockedUntil <= now) {
    mem.lockedUntil = null;
    mem.failedAttempts = 0;
  }

  // 2. Check database user_security_logs
  try {
    const { data: log, error } = await supabase
      .from('user_security_logs')
      .select('failed_login_attempts, locked_until')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error) {
      // Table may be in process of being populated; rely on memory
      console.warn("user_security_logs query notice:", error.message);
      return { isLocked: false };
    }

    if (log && log.locked_until) {
      const lockTime = new Date(log.locked_until).getTime();
      if (lockTime > now) {
        // Sync to memory
        mem.lockedUntil = lockTime;
        mem.failedAttempts = log.failed_login_attempts;
        return {
          isLocked: true,
          error: "Too many attempts. Account locked for 24 hours",
        };
      } else {
        // Lockout expired, auto-clear in DB
        await supabase
          .from('user_security_logs')
          .update({ locked_until: null, failed_login_attempts: 0, updated_at: new Date().toISOString() })
          .eq('email', cleanEmail);
        mem.lockedUntil = null;
        mem.failedAttempts = 0;
      }
    }
  } catch (err) {
    console.error("Error checking login lockout:", err);
  }

  return { isLocked: false };
}

export async function recordLoginFailure(email: string): Promise<{ isLocked: boolean; error: string }> {
  const cleanEmail = email.toLowerCase().trim();
  const supabase = await getSupabaseServerClient();
  const now = Date.now();
  const mem = getMemoryRecord(cleanEmail);

  mem.failedAttempts += 1;
  let currentAttempts = mem.failedAttempts;
  let lockedUntilIso: string | null = null;

  if (currentAttempts >= 3) {
    const lockExpiry = now + 24 * 60 * 60 * 1000; // 24 hours
    mem.lockedUntil = lockExpiry;
    lockedUntilIso = new Date(lockExpiry).toISOString();
  }

  try {
    const { data: existing } = await supabase
      .from('user_security_logs')
      .select('failed_login_attempts')
      .eq('email', cleanEmail)
      .maybeSingle();

    const dbAttempts = (existing?.failed_login_attempts || 0) + 1;
    currentAttempts = Math.max(currentAttempts, dbAttempts);

    if (currentAttempts >= 3 && !lockedUntilIso) {
      const lockExpiry = now + 24 * 60 * 60 * 1000;
      mem.lockedUntil = lockExpiry;
      lockedUntilIso = new Date(lockExpiry).toISOString();
    }

    await supabase
      .from('user_security_logs')
      .upsert({
        email: cleanEmail,
        failed_login_attempts: currentAttempts,
        locked_until: lockedUntilIso,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });
  } catch (err) {
    console.error("Error recording login failure in DB:", err);
  }

  if (currentAttempts >= 3) {
    return {
      isLocked: true,
      error: "Too many attempts. Account locked for 24 hours",
    };
  }

  const remaining = 3 - currentAttempts;
  return {
    isLocked: false,
    error: `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before account lockout.`,
  };
}

export async function recordLoginSuccess(email: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  const supabase = await getSupabaseServerClient();
  const mem = getMemoryRecord(cleanEmail);

  mem.failedAttempts = 0;
  mem.lockedUntil = null;

  try {
    await supabase
      .from('user_security_logs')
      .upsert({
        email: cleanEmail,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' });
  } catch (err) {
    console.error("Error resetting login attempts in DB:", err);
  }
}

export async function checkAndRecordOtpRequest(email: string): Promise<{ allowed: boolean; error?: string }> {
  const cleanEmail = email.toLowerCase().trim();
  const supabase = await getSupabaseServerClient();
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const mem = getMemoryRecord(cleanEmail);

  // In-memory rate-limit check
  if (mem.lastOtpRequest && (now - mem.lastOtpRequest > oneDayMs)) {
    mem.otpRequestsToday = 0;
  }
  if (mem.otpRequestsToday >= 3) {
    return {
      allowed: false,
      error: "Maximum OTP limit reached (3 requests per 24 hours). Please try again tomorrow.",
    };
  }

  // Database rate-limit check
  try {
    const { data: log, error } = await supabase
      .from('user_security_logs')
      .select('otp_requests_today, last_otp_request')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (!error && log) {
      const lastOtpTime = log.last_otp_request ? new Date(log.last_otp_request).getTime() : 0;
      let requestsToday = log.otp_requests_today || 0;

      if (lastOtpTime && (now - lastOtpTime > oneDayMs)) {
        requestsToday = 0;
      }

      if (requestsToday >= 3) {
        mem.otpRequestsToday = requestsToday;
        return {
          allowed: false,
          error: "Maximum OTP limit reached (3 requests per 24 hours). Please try again tomorrow.",
        };
      }

      const nextCount = requestsToday + 1;
      mem.otpRequestsToday = nextCount;
      mem.lastOtpRequest = now;

      await supabase
        .from('user_security_logs')
        .upsert({
          email: cleanEmail,
          otp_requests_today: nextCount,
          last_otp_request: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' });

      return { allowed: true };
    }
  } catch (err) {
    console.error("Error checking OTP rate-limit in DB:", err);
  }

  // Fallback to memory
  mem.otpRequestsToday += 1;
  mem.lastOtpRequest = now;

  return { allowed: true };
}

// =========================================================================
// MAIN SERVER ACTIONS: SIGN UP, SIGN IN, VERIFY, RESET
// =========================================================================

export async function signUpWithEmail(formData: FormData) {
  const email = (formData.get('email') as string || '').toLowerCase().trim();
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;

  if (!email || !password) {
    return { error: 'Work email and password are required.' };
  }

  // Pre-Check: 3 OTP requests in 24h limit
  const otpCheck = await checkAndRecordOtpRequest(email);
  if (!otpCheck.allowed) {
    return { error: otpCheck.error };
  }

  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  // UI Intercept: We do NOT redirect to dashboard. User must verify OTP.
  return {
    success: true,
    requiresVerification: true,
    email,
  };
}

export async function signInWithEmail(formData: FormData) {
  const email = (formData.get('email') as string || '').toLowerCase().trim();
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  // Pre-Check: 3-Strike Lockout Firewall
  const lockoutCheck = await checkLoginLockout(email);
  if (lockoutCheck.isLocked) {
    // Instantly reject WITHOUT pinging Supabase Auth
    return { error: lockoutCheck.error };
  }

  const supabase = await getSupabaseServerClient();

  // Execution: Attempt login with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Failure handling: Increment failed attempts, trigger 24h lockout if hits 3
    const failureResult = await recordLoginFailure(email);
    return { error: failureResult.error };
  }

  // Success handling: Reset failed login attempts
  await recordLoginSuccess(email);

  if (data?.user) {
    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (upsertError) {
      console.error("Failed to sync user profile on signin:", upsertError);
    }

    // Ensure chart of accounts is seeded
    await supabase.rpc('initialize_default_accounts', { p_user_id: data.user.id });
  }

  return { success: true };
}

export async function verifySignupOtp({ email, token }: { email: string; token: string }) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanToken = token.trim();

  if (!cleanEmail || !cleanToken) {
    return { error: 'Email and 6-digit verification code are required.' };
  }

  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'signup',
  });

  if (error) {
    return { error: error.message };
  }

  if (data?.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      email: data.user.email,
      created_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    await supabase.rpc('initialize_default_accounts', { p_user_id: data.user.id });
  }

  return { success: true };
}

export async function resendSignupOtp(email: string) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) {
    return { error: 'Email address is required.' };
  }

  // Backend rate limit check (max 3 in 24 hours)
  const otpCheck = await checkAndRecordOtpRequest(cleanEmail);
  if (!otpCheck.allowed) {
    return { error: otpCheck.error };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: cleanEmail,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, message: 'Verification code resent successfully.' };
}

export async function requestPasswordReset(email: string) {
  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) {
    return { error: 'Please enter your corporate email address.' };
  }

  // Check 3-per-day OTP limit
  const otpCheck = await checkAndRecordOtpRequest(cleanEmail);
  if (!otpCheck.allowed) {
    return { error: otpCheck.error };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

  if (error) {
    return { error: error.message };
  }

  return { success: true, email: cleanEmail };
}

export async function verifyRecoveryOtp({ email, token }: { email: string; token: string }) {
  const cleanEmail = email.toLowerCase().trim();
  const cleanToken = token.trim();

  if (!cleanEmail || !cleanToken) {
    return { error: 'Email and 6-digit recovery code are required.' };
  }

  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'recovery',
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, user: data.user };
}

export async function updateUserPassword(newPassword: string) {
  if (!newPassword || newPassword.length < 6) {
    return { error: 'Password must be at least 6 characters in length.' };
  }

  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function signOutUser() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return { success: true };
}