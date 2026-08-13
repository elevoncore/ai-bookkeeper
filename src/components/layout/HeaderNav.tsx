'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { useTheme } from 'next-themes';
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
  
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  // Get user initials
  const initials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'AI';

  return (
    <header className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 md:px-12 pointer-events-none">
      <div className="pointer-events-auto flex items-center justify-between gap-4 md:gap-8 h-16 px-4 md:px-8 bg-white/40 backdrop-blur-2xl border border-white/60 rounded-full shadow-2xl shadow-slate-200/50 transition-all">
          
          {/* LEFT: Logo & Brand Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div>
                <span className="font-heading font-extrabold text-lg text-gray-900 tracking-tight flex items-center gap-1.5">
                  AI <span className="text-blue-600">BookKeeper</span>
                </span>
              </div>
            </div>
          </div>

          {/* CENTER: Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-white/40 backdrop-blur-md p-1 rounded-full border border-white/40">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-blue-600" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'sales'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Revenue & Invoices</span>
              {pendingCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('purchases')}
              className={`flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <Receipt className="w-4 h-4 text-indigo-600" />
              <span>Expenses & Bills</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200/80 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <span>Reports</span>
            </button>
          </nav>

          {/* RIGHT: Notifications & User Profile */}
          <div className="flex items-center gap-2 sm:gap-4 pl-4 border-l border-slate-200/50">
            
            {/* Theme Toggle Removed for Dashboard */}

            {/* Notifications Bell */}
            <div className="relative">
              <button 
                onClick={() => { setShowNotifications(!showNotifications); setShowUserDropdown(false); }}
                className="p-2 text-gray-500 hover:text-gray-800:text-white hover:bg-gray-100:bg-slate-800 rounded-full transition-colors relative cursor-pointer"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {pendingCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white animate-pulse" />
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 pb-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900">Notifications</span>
                    <span className="text-xs text-blue-600 font-medium cursor-pointer">Mark all read</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                    {pendingCount > 0 ? (
                      <div className="p-3 hover:bg-gray-50 transition-colors cursor-pointer flex gap-3 items-start">
                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                          <Bell className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-800">
                            {pendingCount} Pending Transaction{pendingCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            AI extracted new expense drafts awaiting your verification.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                        All caught up! No pending alerts.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Avatar */}
            <div className="relative">
              <button
                onClick={() => { setShowUserDropdown(!showUserDropdown); setShowNotifications(false); }}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer border border-gray-200"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {initials}
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 mr-1 hidden sm:block" />
              </button>

              {/* User Dropdown */}
              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="py-1">
                    <button
                      onClick={() => { setActiveTab('overview'); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                    >
                      <UserIcon className="w-4 h-4 text-gray-400" /> My Account
                    </button>
                    <button
                      onClick={() => { setActiveTab('reports'); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-4 h-4 text-gray-400" /> App Settings
                    </button>
                  </div>

                  <div className="pt-1 border-t border-gray-100">
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
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
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg md:hidden cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

          </div>
        </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pt-2 pb-4 space-y-2">
          <button
            onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === 'overview' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard className="w-5 h-5 text-blue-600" /> Overview Dashboard
          </button>

          <button
            onClick={() => { setActiveTab('sales'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === 'sales' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Revenue & Invoices
            </div>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('purchases'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === 'purchases' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Receipt className="w-5 h-5 text-indigo-600" /> Expenses & Bills
          </button>

          <button
            onClick={() => { setActiveTab('reports'); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
              activeTab === 'reports' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-5 h-5 text-purple-600" /> Financial Reports
          </button>
        </div>
      )}
    </header>
  );
}

