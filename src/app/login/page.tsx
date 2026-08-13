'use client';

import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../actions/auth';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Receipt, Mail, Lock, Eye, EyeOff, Loader2, User as UserIcon, MailCheck } from 'lucide-react';

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        
        {/* App Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-3">
            <Receipt className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {verificationSent ? 'Check your email' : isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            AI-Powered Bookkeeper & Expense Tracker
          </p>
        </div>

        {verificationSent ? (
          /* Email Verification Sent UI State */
          <div className="text-center space-y-4 py-2 animate-in fade-in duration-300">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 text-blue-600 mb-1">
              <MailCheck className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-gray-900">Verification Link Sent</h3>
              <p className="text-xs text-gray-600 max-w-xs mx-auto leading-relaxed">
                If custom SMTP is enabled in Supabase, a link was sent to <span className="font-semibold text-gray-900">{registeredEmail}</span>.
              </p>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-xs text-blue-800 space-y-1 text-left">
              <p className="font-semibold">Need to sign in immediately?</p>
              <p className="text-[11px] text-blue-600">If your Supabase project auto-confirms signups (default), your account is already active. You can sign in directly with your email and password.</p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => { setVerificationSent(false); setIsSignUp(false); setError(null); setMessage(null); }}
                className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-all cursor-pointer"
              >
                Proceed to Sign In
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Toggle */}
            <div className="flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => { setIsSignUp(false); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-md transition-all ${!isSignUp ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUp(true); setError(null); setMessage(null); }}
                className={`flex-1 py-2 rounded-md transition-all ${isSignUp ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Register
              </button>
            </div>

            {/* Google OAuth Button (PROMINENT AT TOP) */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
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
              <div className="border-t border-gray-200 w-full" />
              <span className="bg-white px-3 text-xs uppercase font-semibold text-gray-400 absolute">or</span>
            </div>

            {/* Banners */}
            {error && (
              <div className="p-3 text-xs text-red-700 bg-red-50 rounded-lg border border-red-100 font-medium text-center">
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 text-xs text-green-700 bg-green-50 rounded-lg border border-green-100 font-medium text-center">
                {message}
              </div>
            )}

            {/* Form */}
            <form action={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required={isSignUp}
                      className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                      placeholder="Alex Smith"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-gray-300 pl-10 pr-10 py-2 text-gray-900 text-sm focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50 transition-all flex items-center justify-center cursor-pointer"
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

            <div className="text-center text-xs text-gray-500">
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