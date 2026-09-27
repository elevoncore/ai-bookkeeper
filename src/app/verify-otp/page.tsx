'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifySignupOtp, resendSignupOtp } from '../actions/auth';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, RotateCw, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';

function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const emailParam = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(120);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Sync email from search params if updated
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // Strict 120s countdown timer backed by sessionStorage to prevent bypass via refresh
  useEffect(() => {
    if (!email) return;

    const storageKey = `inscribe_otp_expiry_${email.toLowerCase()}`;
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

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      setError('Please provide the registered email address.');
      return;
    }
    if (!otp || otp.trim().length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setMessage(null);

    try {
      const result = await verifySignupOtp({ email, token: otp.trim() });
      if (result.error) {
        setError(result.error);
        setIsVerifying(false);
      } else {
        setMessage('Identity cryptographic challenge verified! Initializing your double-entry ledger...');
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 800);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP code.');
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (timeLeft > 0 || isResending) return;
    if (!email) {
      setError('Email address is missing.');
      return;
    }

    setIsResending(true);
    setError(null);
    setMessage(null);

    try {
      const result = await resendSignupOtp(email);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage('New 6-digit verification code dispatched to your mailbox.');
        // Reset 120s countdown
        const newExpiry = Date.now() + 120 * 1000;
        const storageKey = `inscribe_otp_expiry_${email.toLowerCase()}`;
        sessionStorage.setItem(storageKey, newExpiry.toString());
        setTimeLeft(120);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code.');
    } finally {
      setIsResending(false);
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
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>CHALLENGE: SIGNUP_OTP_VERIFICATION</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Verify Your Email
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            Enter the 6-digit confirmation code dispatched to:
            <br />
            <strong className="text-slate-800 font-mono text-xs">{email || 'your registered corporate email'}</strong>
          </p>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="alert">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">[VERIFICATION ERROR]</span> {error}
            </div>
          </div>
        )}

        {/* Success Notification */}
        {message && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-start gap-2.5 animate-in fade-in duration-200" role="status">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold">[SUCCESS]</span> {message}
            </div>
          </div>
        )}

        {/* Form Submission */}
        <form onSubmit={handleVerify} className="space-y-5">
          {!emailParam && (
            <div>
              <label htmlFor="manualEmail" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Email Address
              </label>
              <input
                id="manualEmail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="otpInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                6-Digit Security Token
              </label>
              <span className="text-[10px] font-mono text-slate-400">
                NUMERIC ONLY
              </span>
            </div>

            <div className="relative">
              <input
                id="otpInput"
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
            <p className="text-[11px] text-slate-500 mt-1.5 text-center">
              Token expires in 15 minutes. Check spam/junk folder if not received.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            <button
              type="submit"
              disabled={isVerifying || otp.length !== 6}
              className="w-full py-3 min-h-[44px] rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  <span>VERIFYING CRYPTOGRAPHIC TOKEN...</span>
                </>
              ) : (
                <span>CONFIRM &amp; ACTIVATE ACCOUNT →</span>
              )}
            </button>

            {/* Strict 2-minute (120s) Countdown Timer & Resend Button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={timeLeft > 0 || isResending}
                className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
                  timeLeft > 0
                    ? 'text-slate-400 bg-slate-50 cursor-not-allowed border border-slate-100'
                    : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 cursor-pointer font-bold'
                }`}
              >
                {isResending ? (
                  'Dispatching new token...'
                ) : timeLeft > 0 ? (
                  `Resend Code in ${formatTime(timeLeft)}`
                ) : (
                  'Resend Verification Code'
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Footer Navigation */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <Link href="/login" className="hover:text-slate-900 font-semibold inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Sign In</span>
          </Link>
          <span className="font-mono text-[10px] text-slate-400">
            MAX 3 ATTEMPTS / 24H
          </span>
        </div>

      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Loading Verification Gateway...
        </div>
      </div>
    }>
      <VerifyOtpContent />
    </Suspense>
  );
}
