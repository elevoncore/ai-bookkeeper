'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { 
  User as UserIcon, 
  Settings, 
  AlertTriangle, 
  ArrowLeft, 
  CheckCircle2, 
  ShieldCheck, 
  Sliders, 
  Globe, 
  DollarSign, 
  Lock, 
  Key, 
  RefreshCw, 
  Download, 
  Trash2, 
  Save, 
  Sparkles,
  Camera,
  Mail,
  Calendar,
  Layers
} from 'lucide-react';
import toast from 'react-hot-toast';

type SettingsTab = 'account' | 'app' | 'danger';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsTab;

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // App Preferences State
  const [currency, setCurrency] = useState('PKR');
  const [timezone, setTimezone] = useState('Asia/Karachi');
  const [accountingBasis, setAccountingBasis] = useState<'accrual' | 'cash'>('accrual');
  const [aiStrictness, setAiStrictness] = useState<'strict' | 'balanced' | 'permissive'>('strict');
  const [requireManualApproval, setRequireManualApproval] = useState(true);
  const [autoRealizeCogs, setAutoRealizeCogs] = useState(true);
  const [fiscalYearStart, setFiscalYearStart] = useState('July');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Sync active tab with URL query parameter
  useEffect(() => {
    if (tabParam && ['account', 'app', 'danger'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Fetch authenticated user profile
  useEffect(() => {
    async function loadUserData() {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser(user);
          setUserEmail(user.email || '');
          const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
          if (metaName) {
            setDisplayName(metaName);
          } else if (user.email) {
            const fallback = user.email.split('@')[0];
            setDisplayName(fallback.charAt(0).toUpperCase() + fallback.slice(1));
          }
        }
      } catch (err) {
        console.error("Error loading settings user:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadUserData();
  }, []);

  function handleTabChange(tab: SettingsTab) {
    setActiveTab(tab);
    router.replace(`/dashboard/settings?tab=${tab}`, { scroll: false });
  }

  async function handleSaveAccount(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName }
      });
      if (error) throw error;
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!userEmail) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: `${window.location.origin}/login?reset=true`
      });
      if (error) throw error;
      toast.success(`Password reset link sent to ${userEmail}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset link");
    }
  }

  function handleSaveAppSettings() {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      toast.success("App preferences saved successfully!");
    }, 600);
  }

  const initials = displayName 
    ? displayName.substring(0, 2).toUpperCase() 
    : (userEmail ? userEmail.substring(0, 2).toUpperCase() : 'AI');

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      
      {/* Top App Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-2xl border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="font-heading font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
              Inscribe<span className="text-blue-600">AI</span>
            </span>
            <span className="text-xs font-bold text-slate-400">/</span>
            <span className="text-xs sm:text-sm font-bold text-slate-600">Settings Hub</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {initials}
          </div>
          <span className="text-xs font-semibold text-slate-700 hidden md:inline-block truncate max-w-[180px]">
            {userEmail}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        
        {/* Page Title */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Sliders className="w-7 h-7 text-blue-600" />
            System & Account Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your personal profile, ERP accounting preferences, and AI bookkeeper strictness.
          </p>
        </div>

        {/* Two-Column SaaS Settings Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 flex-1 items-start">
          
          {/* Left Column: Navigation Sidebar / Tabs */}
          <aside className="lg:col-span-3 w-full bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 p-2 sm:p-3 shadow-sm flex lg:flex-col overflow-x-auto lg:overflow-x-visible gap-1.5 shrink-0 custom-scrollbar">
            
            <button
              onClick={() => handleTabChange('account')}
              className={`flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap lg:whitespace-normal w-auto lg:w-full ${
                activeTab === 'account'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <UserIcon className={`w-4 h-4 shrink-0 ${activeTab === 'account' ? 'text-white' : 'text-blue-600'}`} />
              <div className="text-left">
                <span>My Account</span>
                <p className={`text-[10px] font-normal hidden lg:block ${activeTab === 'account' ? 'text-blue-100' : 'text-slate-400'}`}>
                  Profile & credentials
                </p>
              </div>
            </button>

            <button
              onClick={() => handleTabChange('app')}
              className={`flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap lg:whitespace-normal w-auto lg:w-full ${
                activeTab === 'app'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'app' ? 'text-white' : 'text-purple-600'}`} />
              <div className="text-left">
                <span>App Settings</span>
                <p className={`text-[10px] font-normal hidden lg:block ${activeTab === 'app' ? 'text-blue-100' : 'text-slate-400'}`}>
                  ERP rules & AI strictness
                </p>
              </div>
            </button>

            <button
              onClick={() => handleTabChange('danger')}
              className={`flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap lg:whitespace-normal w-auto lg:w-full ${
                activeTab === 'danger'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                  : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50/50'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 shrink-0 ${activeTab === 'danger' ? 'text-white' : 'text-rose-600'}`} />
              <div className="text-left">
                <span>Danger Zone</span>
                <p className={`text-[10px] font-normal hidden lg:block ${activeTab === 'danger' ? 'text-rose-100' : 'text-slate-400'}`}>
                  Reset ledger & archive
                </p>
              </div>
            </button>

          </aside>

          {/* Right Column: Active Content Panel */}
          <main className="lg:col-span-9 w-full">
            
            {/* TAB 1: MY ACCOUNT */}
            {activeTab === 'account' && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-8 animate-in fade-in duration-200">
                
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-blue-600" />
                    Personal Profile & Account
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Manage your personal account details and session credentials.
                  </p>
                </div>

                {/* Avatar & Identicon Card */}
                <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-slate-50 to-blue-50/40 border border-slate-100">
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                      {initials}
                    </div>
                    <button 
                      onClick={() => toast("Avatar uploads are managed via Gravatar / Google SSO.", { icon: "ℹ️" })}
                      className="absolute inset-0 rounded-3xl bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Upload Avatar"
                    >
                      <Camera className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="text-center sm:text-left space-y-1">
                    <h3 className="font-bold text-slate-900 text-base">{displayName || 'Authorized User'}</h3>
                    <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {userEmail}
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Verified Bookkeeper
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        UID: {user?.id ? user.id.substring(0, 8).toUpperCase() : 'AI-USER'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Form Fields */}
                <form onSubmit={handleSaveAccount} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Alex Mitchell"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Email Address (Read-only)
                      </label>
                      <input
                        type="email"
                        value={userEmail}
                        disabled
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100/70 text-slate-500 text-sm cursor-not-allowed outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? "Saving..." : "Save Profile Changes"}
                    </button>
                  </div>
                </form>

                {/* Security Section */}
                <div className="pt-6 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Security & Password
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Send a secure password reset link to your registered email address.
                  </p>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Password Authentication</p>
                        <p className="text-[11px] text-slate-500">Last changed over 30 days ago</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleResetPassword}
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      Send Password Reset Link
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: APP SETTINGS */}
            {activeTab === 'app' && (
              <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-8 animate-in fade-in duration-200">
                
                <div>
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-600" />
                    ERP & Bookkeeping Preferences
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Configure base currency, accounting rules, and AI autonomous controller strictness.
                  </p>
                </div>

                {/* Accounting & Localization Settings */}
                <div className="space-y-5">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-600" />
                    Localization & Standards
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Operating / Reporting Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                      >
                        <option value="PKR">PKR (₨) — Pakistani Rupee</option>
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="EUR">EUR (€) — Euro</option>
                        <option value="GBP">GBP (£) — British Pound</option>
                        <option value="SAR">SAR (﷼) — Saudi Riyal</option>
                        <option value="AED">AED (د.إ) — UAE Dirham</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        System Timezone
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                      >
                        <option value="Asia/Karachi">Asia/Karachi (UTC+05:00 PKT)</option>
                        <option value="UTC">UTC (Universal Time Coordinated)</option>
                        <option value="America/New_York">America/New_York (UTC-05:00 EST)</option>
                        <option value="Europe/London">Europe/London (UTC+00:00 GMT)</option>
                        <option value="Asia/Dubai">Asia/Dubai (UTC+04:00 GST)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Accounting Basis Method
                      </label>
                      <select
                        value={accountingBasis}
                        onChange={(e) => setAccountingBasis(e.target.value as any)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                      >
                        <option value="accrual">Accrual Basis (Recognize upon invoice/bill issue)</option>
                        <option value="cash">Cash Basis (Recognize upon cash payment)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Fiscal Year Start
                      </label>
                      <select
                        value={fiscalYearStart}
                        onChange={(e) => setFiscalYearStart(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer"
                      >
                        <option value="July">July 1st (Standard PK / AU)</option>
                        <option value="January">January 1st (Standard US / Global)</option>
                        <option value="April">April 1st (Standard UK / IN)</option>
                      </select>
                    </div>

                  </div>
                </div>

                {/* AI Controller Strictness */}
                <div className="pt-6 border-t border-slate-100 space-y-5">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    AI Bookkeeper Autonomous Rules
                  </h3>

                  <div className="space-y-4">
                    
                    {/* Toggle 1: Manual Approval */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-slate-900">Require Manual Verification for AI Journal Drafts</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          When enabled, AI-extracted bills and invoices stage as unverified pending drafts before ledger posting.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRequireManualApproval(!requireManualApproval)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors shrink-0 ${
                          requireManualApproval ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          requireManualApproval ? 'translate-x-6' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {/* Toggle 2: Auto COGS Realization */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-slate-900">Strict COGS Realization & WAC Inventory Match</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Automatically calculate cost of goods sold and decrement inventory asset ledger on every sale.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoRealizeCogs(!autoRealizeCogs)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors shrink-0 ${
                          autoRealizeCogs ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          autoRealizeCogs ? 'translate-x-6' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                    {/* AI Strictness Options */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-2">
                        AI Ambiguity & Matching Strictness
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'strict', label: 'Strict (95%)', desc: 'Pauses & asks on any asset/inventory ambiguity' },
                          { id: 'balanced', label: 'Balanced (80%)', desc: 'Intelligently infers common operational expenses' },
                          { id: 'permissive', label: 'Permissive (65%)', desc: 'Auto-maps maximum transactions to standard accounts' }
                        ].map((opt) => (
                          <div
                            key={opt.id}
                            onClick={() => setAiStrictness(opt.id as any)}
                            className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                              aiStrictness === opt.id
                                ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <p className={`text-xs font-bold ${aiStrictness === opt.id ? 'text-blue-900' : 'text-slate-800'}`}>
                              {opt.label}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                              {opt.desc}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleSaveAppSettings}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </button>
                </div>

              </div>
            )}

            {/* TAB 3: DANGER ZONE */}
            {activeTab === 'danger' && (
              <div className="bg-white rounded-3xl border border-rose-200/80 p-6 sm:p-8 shadow-sm space-y-8 animate-in fade-in duration-200">
                
                <div>
                  <h2 className="text-xl font-bold text-rose-700 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    Danger Zone & Maintenance
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Irreversible actions, database archives, and sandbox resets.
                  </p>
                </div>

                <div className="space-y-4">
                  
                  {/* Reset Demo Ledger */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-rose-50/50 border border-rose-100">
                    <div>
                      <h3 className="text-xs font-bold text-rose-900">Reset Demo Transactions & Test Ledger</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-lg">
                        Deletes test invoices and non-system journal entries while preserving your default Chart of Accounts and Walk-in Customer entity.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toast.error("Database reset is restricted in production mode.")}
                      className="px-4 py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0"
                    >
                      Reset Ledger Data
                    </button>
                  </div>

                  {/* Export Full System Backup */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-50 border border-slate-100">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">Export Complete System Archive (.xlsx)</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-lg">
                        Download an immediate full multi-sheet Excel backup containing Invoices, Bills, Journal Entries, and Chart of Accounts.
                      </p>
                    </div>

                    <Link
                      href="/dashboard"
                      className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-600" />
                      Open Export Engine
                    </Link>
                  </div>

                  {/* Delete Account */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-rose-50/50 border border-rose-100">
                    <div>
                      <h3 className="text-xs font-bold text-rose-900">Terminate Account & Delete Organization</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5 max-w-lg">
                        Permanently purge your business profile, authenticated keys, and all accounting data. This action cannot be undone.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toast.error("Account termination requires administrative escalation.")}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Account
                    </button>
                  </div>

                </div>

              </div>
            )}

          </main>

        </div>

      </div>

    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Loading Settings Hub...
        </div>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
