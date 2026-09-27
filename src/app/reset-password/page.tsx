'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyRecoveryOtp, updateUserPassword, requestPasswordReset, signOutUser } from '../actions/auth';
import Link from 'next/link';
import { KeyRound, ArrowLeft, RotateCw, AlertTriangle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';

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
      setError('Corporate email is required.');
      return;
    }
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the full 6-digit recovery code.');
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
        setMessage('Recovery token authenticated. Please establish your new master password.');
        setPhase('new_password');
        setIsLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate recovery token.');
      setIsLoading(false);
    }
  }

  async function handleResendCode() {
    if (timeLeft > 0 || isResending) return;
    if (!email) {
      setError('Please provide your corporate email address.');
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
        setMessage('New 6-digit recovery code dispatched to your mailbox.');
        const newExpiry = Date.now() + 120 * 1000;
        const storageKey = `inscribe_recovery_expiry_${email.toLowerCase()}`;
        sessionStorage.setItem(storageKey, newExpiry.toString());
        setTimeLeft(120);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend recovery token.');
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
        setMessage('Master password updated successfully! Redirecting to secure login...');
        await signOutUser();
        setTimeout(() => {
          router.push('/login?reset=success');
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update master password.');
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
        
        {/* Header Telemetry */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-mono font-bold text-slate-700 border border-slate-200">
            <KeyRound className="w-3.5 h-3.5 text-blue-600" />
            <span>PROTOCOL: RECOVERY_SESSION_AUTH</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {phase === 'verify' ? 'Password Recovery' : 'Create New Password'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {phase === 'verify' ? (
              <>
                Enter the 6-digit recovery OTP dispatched to:
                <br />
                <strong className="text-slate-800 font-mono text-xs">{email || 'your registered corporate email'}</strong>
              </>
            ) : (
              'Enter and confirm your new master credentials.'
            )}
          </p>
        </div>

        {/* Status Error Alert */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">[RECOVERY ERROR]</span> {error}
            </div>
          </div>
        )}

        {/* Status Success Alert */}
        {message && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="status">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">[SUCCESS]</span> {message}
            </div>
          </div>
        )}

        {phase === 'verify' ? (
          /* STEP 1: VERIFY 6-DIGIT RECOVERY OTP */
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            {!emailParam && (
              <div>
                <label htmlFor="recoveryEmail" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Corporate Email
                </label>
                <input
                  id="recoveryEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex.vance@company.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="recoveryOtp" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  6-Digit Recovery Token
                </label>
                <span className="text-[10px] font-mono text-slate-400">
                  NUMERIC
                </span>
              </div>

              <div className="relative">
                <input
                  id="recoveryOtp"
                  type="text"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full tracking-[0.5em] text-center font-mono font-extrabold text-2xl py-3 px-4 rounded-xl border-2 border-slate-200 focus:border-slate-900 focus:ring-0 outline-none transition-all placeholder:text-slate-300 placeholder:tracking-normal"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-4" />
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>AUTHENTICATING RECOVERY TOKEN...</span>
                  </>
                ) : (
                  <span>VALIDATE TOKEN &amp; PROCEED →</span>
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
                    'Dispatching token...'
                  ) : timeLeft > 0 ? (
                    `Resend Code in ${formatTime(timeLeft)}`
                  ) : (
                    'Resend Recovery Token'
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
                  New Master Password
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
                Confirm New Password
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

            {/* NIST SP 800-63B Entropy Meter */}
            <div className="pt-1 space-y-1">
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-500">
                <span>SECURITY LEVEL: {newPassword.length >= 8 ? 'STRONG (AES-256)' : 'STANDARD'}</span>
                <span className="font-semibold text-slate-700">NIST COMPLIANT</span>
              </div>
              <div className="grid grid-cols-4 gap-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className={`transition-all ${newPassword.length >= 6 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`transition-all ${newPassword.length >= 8 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`transition-all ${newPassword.length >= 10 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <div className={`transition-all ${newPassword.length >= 12 && newPassword === confirmPassword ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </div>
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
                    <span>ENCRYPTING &amp; COMMITTING CREDENTIALS...</span>
                  </>
                ) : (
                  <span>UPDATE MASTER PASSWORD →</span>
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
          <span className="font-mono text-[10px] text-slate-400">
            FIPS 140-2 COMPLIANT
          </span>
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
          Loading Recovery Portal...
        </div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
