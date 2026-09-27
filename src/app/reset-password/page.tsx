'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyRecoveryOtp, updateUserPassword, requestPasswordReset, signOutUser } from '../actions/auth';
import Link from 'next/link';
import { ArrowLeft, RotateCw, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const emailParam = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailParam);
  const [phase, setPhase] = useState<'verify' | 'new_password'>('verify');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // Strict 120s timer for resending recovery OTP
  useEffect(() => {
    if (!email) return;

    const storageKey = `inscribe_recovery_expiry_${email.toLowerCase()}`;
    const storedExpiry = sessionStorage.getItem(storageKey);
    let targetTime: number;

    if (storedExpiry) {
      targetTime = parseInt(storedExpiry, 10);
    } else {
      targetTime = Date.now() + 120 * 1000;
      sessionStorage.setItem(storageKey, targetTime.toString());
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [email]);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError('Email is required.');
      return;
    }
    if (!otp || otp.trim().length !== 8) {
      setError('Please enter the 8-digit recovery code.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await verifyRecoveryOtp({ email, token: otp.trim() });
      if (result.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setMessage('Code verified. Please enter your new password.');
        setPhase('new_password');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify recovery code.');
      setIsLoading(false);
    }
  }

  async function handleResendCode() {
    if (timeLeft > 0 || isResending) return;
    if (!email) {
      setError('Email is required.');
      return;
    }

    setIsResending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage('A new recovery code has been sent to your email.');
        const newExpiry = Date.now() + 120 * 1000;
        const storageKey = `inscribe_recovery_expiry_${email.toLowerCase()}`;
        sessionStorage.setItem(storageKey, newExpiry.toString());
        setTimeLeft(120);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend recovery code.');
    } finally {
      setIsResending(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters in length.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await updateUserPassword(newPassword);
      if (result.error) {
        setError(result.error);
        setIsLoading(false);
      } else {
        setMessage('Password updated successfully! Redirecting to sign in...');
        await signOutUser();
        setTimeout(() => {
          router.push('/login?reset=success');
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
      setIsLoading(false);
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 text-slate-900 px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {phase === 'verify' ? 'Reset Password' : 'Create New Password'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {phase === 'verify' ? 'Enter your email address and 8-digit code.' : 'Enter your new password below.'}
          </p>
        </div>

        {/* Status Error Alert */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              {error}
            </div>
          </div>
        )}

        {/* Status Success Alert */}
        {message && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="status">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              {message}
            </div>
          </div>
        )}

        {phase === 'verify' ? (
          /* STEP 1: VERIFY 8-DIGIT RECOVERY OTP */
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label htmlFor="recoveryEmail" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                id="recoveryEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label htmlFor="recoveryOtp" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                8-Digit Recovery Code
              </label>

              <div className="relative">
                <input
                  id="recoveryOtp"
                  type="text"
                  maxLength={8}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="12345678"
                  className="w-full tracking-[0.25em] sm:tracking-[0.35em] text-center font-mono font-extrabold text-2xl py-3 px-4 rounded-xl border-2 border-slate-200 focus:border-slate-900 focus:ring-0 outline-none transition-all placeholder:text-slate-300 placeholder:tracking-normal"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-4" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                Enter the 8-digit code sent to your email. Expires in 15 minutes.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="submit"
                disabled={isLoading || otp.trim().length !== 8}
                className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Verify Code</span>
                )}
              </button>

              {/* 120s Resend Timer */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={timeLeft > 0 || isResending}
                  className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
                    timeLeft > 0
                      ? 'text-slate-400 bg-slate-50 cursor-not-allowed border border-slate-100'
                      : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 cursor-pointer font-bold'
                  }`}
                >
                  {isResending ? (
                    'Sending code...'
                  ) : timeLeft > 0 ? (
                    `Resend Code in ${formatTime(timeLeft)}`
                  ) : (
                    'Resend Code'
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* STEP 2: ENTER NEW PASSWORD FORM */
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider" htmlFor="newPassword">
                  New Password
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
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || !newPassword || !confirmPassword}
                className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer Navigation */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-900 font-semibold inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Sign In</span>
          </Link>
        </div>

      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
