'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Receipt, 
  Bell, 
  Settings, 
  LogOut, 
  User as UserIcon, 
  ChevronDown, 
  LayoutDashboard,
  FileSpreadsheet,
  BarChart3,
  CheckCircle2,
  Menu,
  X
} from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

interface HeaderNavProps {
  activeTab: 'overview' | 'sales' | 'purchases' | 'reports';
  setActiveTab: (tab: 'overview' | 'sales' | 'purchases' | 'reports') => void;
  userEmail?: string;
  pendingCount?: number;
}

export default function HeaderNav({ 
  activeTab, 
  setActiveTab, 
  userEmail = 'user@aibookkeeper.com',
  pendingCount = 0
}: HeaderNavProps) {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowUserDropdown(false);
        setShowNotifications(false);
        setMobileMenuOpen(false);
      }
    }
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'AI';

  return (
    <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex flex-col items-center px-3 sm:px-6 md:px-12 pointer-events-none" role="banner">
      <div className="pointer-events-auto flex items-center justify-between gap-2 sm:gap-4 md:gap-8 h-16 px-3.5 sm:px-6 md:px-8 bg-white/75 dark:bg-slate-900/80 backdrop-blur-2xl border border-white/60 dark:border-slate-800 rounded-full shadow-xl shadow-slate-200/50 dark:shadow-black/60 transition-all w-full max-w-[1700px]">
          
          {/* LEFT: Logo & Brand Badge */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="font-heading font-extrabold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-1.5 truncate">
              i4n<span className="text-blue-600 dark:text-blue-400">scribe</span>
            </span>
            <span className="hidden xl:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
              AI Bookkeeper
            </span>
          </div>

          {/* CENTER: Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-md p-1 rounded-full border border-slate-200/60 dark:border-slate-700/60" aria-label="Main navigation">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'overview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
              aria-current={activeTab === 'overview' ? 'page' : undefined}
            >
              <LayoutDashboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'sales'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
              aria-current={activeTab === 'sales' ? 'page' : undefined}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Revenue & Invoices</span>
              {pendingCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'purchases'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
              aria-current={activeTab === 'purchases' ? 'page' : undefined}
            >
              <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Expenses & Bills</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'reports'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
              aria-current={activeTab === 'reports' ? 'page' : undefined}
            >
              <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Reports</span>
            </button>
          </nav>

          {/* RIGHT: Theme Toggle, Notifications & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-200 dark:border-slate-800">
            
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notifications Bell */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => { setShowNotifications(!showNotifications); setShowUserDropdown(false); }}
                className="p-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors relative cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Notifications"
                aria-label="Notifications"
                aria-haspopup="true"
                aria-expanded={showNotifications}
              >
                <Bell className="w-5 h-5" />
                {pendingCount > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div 
                  className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="region"
                  aria-label="Notifications panel"
                >
                  <div className="px-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">Notifications</span>
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold cursor-pointer">Mark all read</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-slate-50 dark:divide-slate-800">
                    {pendingCount > 0 ? (
                      <div className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {pendingCount} Pending Transaction{pendingCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            AI extracted new expense drafts awaiting your verification.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400 dark:text-slate-500">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        All caught up! No pending alerts.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => { setShowUserDropdown(!showUserDropdown); setShowNotifications(false); }}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 min-h-[44px]"
                aria-label="User Profile"
                aria-haspopup="true"
                aria-expanded={showUserDropdown}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {initials}
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mr-1 hidden sm:block" />
              </button>

              {/* User Dropdown */}
              {showUserDropdown && (
                <div 
                  className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                  aria-label="User account options"
                >
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Signed in as</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{userEmail}</p>
                  </div>
                  <div className="py-1">
                    <button
                      role="menuitem"
                      onClick={() => { setActiveTab('overview'); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" /> My Account
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => { setActiveTab('reports'); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-slate-400" /> App Settings
                    </button>
                  </div>

                  <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg md:hidden cursor-pointer"
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

          </div>
        </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div 
          className="pointer-events-auto md:hidden border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl px-4 pt-3 pb-4 space-y-2 rounded-3xl shadow-2xl mt-2 w-full max-w-md mx-auto animate-in fade-in slide-in-from-top-3 duration-200"
          role="dialog"
          aria-label="Mobile Navigation Menu"
        >
          <button
            onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'overview' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 text-blue-600 dark:text-blue-400" /> Overview Dashboard
          </button>

          <button
            onClick={() => { setActiveTab('sales'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'sales' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> Revenue & Invoices
            </div>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('purchases'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'purchases' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Expenses & Bills
          </button>

          <button
            onClick={() => { setActiveTab('reports'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
              activeTab === 'reports' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Financial Reports
          </button>
        </div>
      )}
    </header>
  );
}
