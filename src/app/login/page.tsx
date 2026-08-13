'use client';

import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../actions/auth';
import { useRouter } from 'next/navigation';
import { Receipt, Mail, Lock, Eye, EyeOff, Loader2, User as UserIcon } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setMessage(null);

    if (isSignUp) {
      const result = await signUpWithEmail(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage('Account registered successfully! Please sign in with your credentials.');
        setIsSignUp(false);
      }
      setLoading(false);
    } else {
      const result = await signInWithEmail(formData);
      if (result.error) {
        setError(result.error);
        setLoading(false);
      } else {
        router.push('/');
        router.refresh();
      }
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        
        {/* App Brand Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 mb-3">
            <Receipt className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            AI-Powered Bookkeeper & Expense Tracker
          </p>
        </div>

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

        {/* Banners */}
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-100 font-medium text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 text-sm text-green-700 bg-green-50 rounded-lg border border-green-100 font-medium text-center">
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
            disabled={loading}
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

      </div>
    </div>
  );
}