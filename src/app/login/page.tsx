'use client';

import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../actions/auth';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Receipt, Mail, Lock, Eye, EyeOff, Loader2, User as UserIcon, MailCheck } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleGoogleSignIn() {
    try {
      setGoogleLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
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

    const emailInput = formData.get('email') as string;

    if (isSignUp) {
      const result = await signUpWithEmail(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.autoLoggedIn) {
        router.push('/dashboard');
        router.refresh();
        return;
      } else if (result.requiresVerification) {
        setRegisteredEmail(emailInput || '');
        setVerificationSent(true);
      } else {
        setMessage('Account created successfully! Please sign in with your credentials.');
        setIsSignUp(false);
      }
      setLoading(false);
    } else {
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

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#090d16] text-slate-900 dark:text-slate-100 px-4 py-12 transition-colors duration-300">
      
      {/* Top Bar with Theme Toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-2xl border border-slate-200/80 dark:border-slate-800">
        
        {/* App Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-3 border border-blue-100 dark:border-blue-800/60 shadow-xs">
            <Receipt className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {verificationSent ? 'Check your email' : isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            i4nscribe Autonomous AI Bookkeeper
          </p>
        </div>

        {verificationSent ? (
          /* Email Verification Sent UI State */
          <div className="text-center space-y-4 py-2 animate-in fade-in duration-300">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-1">
              <MailCheck className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Verification Link Sent</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs mx-auto leading-relaxed">
                If custom SMTP is enabled in Supabase, a link was sent to <span className="font-bold text-slate-900 dark:text-white">{registeredEmail}</span>.
              </p>
            </div>
            <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-200/60 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 space-y-1 text-left">
              <p className="font-bold">Need to sign in immediately?</p>
              <p className="text-[11px] text-blue-700 dark:text-blue-300">If your Supabase project auto-confirms signups (default), your account is already active. You can sign in directly with your email and password.</p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => { setVerificationSent(false); setIsSignUp(false); setError(null); setMessage(null); }}
                className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Proceed to Sign In
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Toggle */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-sm font-semibold border border-slate-200/60 dark:border-slate-700/60" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!isSignUp}
                onClick={() => { setIsSignUp(false); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-lg transition-all min-h-[40px] text-xs font-bold cursor-pointer ${!isSignUp ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700/60' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isSignUp}
                onClick={() => { setIsSignUp(true); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-lg transition-all min-h-[40px] text-xs font-bold cursor-pointer ${isSignUp ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200/60 dark:border-slate-700/60' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
              >
                Register
              </button>
            </div>

            {/* Google OAuth Button */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500 dark:text-slate-400" />
                ) : (
                  <>
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-3 text-xs uppercase font-bold text-slate-400 dark:text-slate-500 absolute">or</span>
            </div>

            {/* Banners */}
            {error && (
              <div className="p-3 text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 rounded-xl border border-rose-200 dark:border-rose-900/60 font-semibold text-center" role="alert">
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-900/60 font-semibold text-center" role="status">
                {message}
              </div>
            )}

            {/* Form */}
            <form action={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label htmlFor="fullName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-5 h-5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required={isSignUp}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                      placeholder="Alex Smith"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 pl-10 pr-11 py-2.5 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 min-h-[44px] text-sm font-bold text-white shadow-md hover:shadow-lg focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center justify-center cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isSignUp ? (
                  'Create Account'
                ) : (
                  'Sign In'
                )}
              </button>
            </form>

            <div className="text-center text-xs text-slate-500 dark:text-slate-400">
              {isSignUp ? (
                <p>By registering, your account profile will be created automatically.</p>
              ) : (
                <p>Enter your credentials to access your financial dashboard.</p>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}