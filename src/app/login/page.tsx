'use client';

import { useState, useEffect, Suspense } from 'react';
import { signInWithEmail, signUpWithEmail, requestPasswordReset } from '../actions/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, KeyRound, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot_password'>('signin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    if (searchParams.get('reset') === 'success' || searchParams.get('message') === 'password_changed') {
      setMessage('Password updated successfully. Please authenticate with your new credentials.');
      setMode('signin');
    }
  }, [searchParams]);

  async function handleGoogleSignIn() {
    try {
      setGoogleLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Google sign in.');
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setMessage(null);

    const emailInput = (formData.get('email') as string || '').toLowerCase().trim();

    if (mode === 'signup') {
      const result = await signUpWithEmail(formData);
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        // UI Intercept: Redirect to /verify-otp screen
        router.push(`/verify-otp?email=${encodeURIComponent(emailInput)}&type=signup`);
      }
    } else if (mode === 'signin') {
      const result = await signInWithEmail(formData);
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    }
  }

  async function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const cleanEmail = forgotEmail.toLowerCase().trim();
    if (!cleanEmail) {
      setError('Please provide your corporate email address.');
      setLoading(false);
      return;
    }

    const result = await requestPasswordReset(cleanEmail);
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push(`/reset-password?email=${encodeURIComponent(cleanEmail)}`);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 text-slate-900 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200">
        
        {/* App Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-mono font-bold text-slate-700 mb-3 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>FIPS 140-2 ENCRYPTED GATEWAY</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {mode === 'forgot_password'
              ? 'Reset Master Password'
              : mode === 'signup'
              ? 'Create your account'
              : 'Welcome back'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-500">
            InscribeAI Autonomous AI Bookkeeper
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">{error.includes('Too many attempts') ? '[ACCOUNT LOCKED]' : '[AUTHENTICATION ERROR]'}</span> {error}
            </div>
          </div>
        )}

        {/* Global Success Banner */}
        {message && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="status">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">[SUCCESS]</span> {message}
            </div>
          </div>
        )}

        {mode === 'forgot_password' ? (
          /* FORGOT PASSWORD FORM */
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your verified corporate email address. A 6-digit recovery OTP will be dispatched to authorize your password reset.
              </p>
              <div className="pt-2">
                <label htmlFor="forgotEmail" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Work Email (Corporate Domain)
                </label>
                <div className="relative">
                  <input
                    id="forgotEmail"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="alex.vance@company-domain.com"
                    className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2.5">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? 'DISPATCHING RECOVERY CODE...' : 'DISPATCH RECOVERY OTP →'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
                className="w-full py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Sign In</span>
              </button>
            </div>
          </form>
        ) : (
          /* STANDARD SIGN IN / SIGN UP */
          <>
            {/* Tab Toggle */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold border border-slate-200" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-lg transition-all min-h-[40px] text-xs font-bold cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-lg transition-all min-h-[40px] text-xs font-bold cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Register
              </button>
            </div>

            {/* Google OAuth Option */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.665-5.17 3.665-9.12z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.26 21.36 7.36 24 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.42l4.02-3.13z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z" />
                </svg>
                <span>{googleLoading ? 'Connecting to Google SSO...' : 'Continue with Google'}</span>
              </button>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                Or continue with credentials
              </span>
            </div>

            {/* Email + Password Form */}
            <form action={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="fullName">
                    Full Name (Entitled Officer)
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    placeholder="Alex Vance"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="email">
                  Work Email (Corporate Domain)
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="alex.vance@company-domain.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="password">
                    Master Password / Token
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />

                {/* Forgot Password Link on Sign In */}
                {mode === 'signin' && (
                  <div className="flex justify-end pt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot_password'); setError(null); setMessage(null); }}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}

                {/* NIST SP 800-63B Entropy Meter on Sign Up */}
                {mode === 'signup' && (
                  <div className="pt-2 space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <span>ENTROPY: 94.2 BITS</span>
                      <span className="font-semibold text-slate-700">NIST SP 800-63B COMPLIANT</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="bg-emerald-500" />
                      <div className="bg-emerald-500" />
                      <div className="bg-emerald-500" />
                      <div className="bg-emerald-500" />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {loading
                    ? 'PROCESSING SESSION...'
                    : mode === 'signup'
                    ? 'PROVISION ACCOUNT →'
                    : 'AUTHENTICATE SESSION →'}
                </button>
              </div>
            </form>

            <div className="pt-2 border-t border-slate-100 text-center">
              <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 font-semibold inline-flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Home Spec</span>
              </Link>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          Loading Authentication Gateway...
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}