'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  X,
  ArrowRight
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: 'bill' | 'invoice' | 'system' | 'expense' | 'sale';
  title: string;
  description: string;
  amount?: number;
  date?: string;
  read?: boolean;
}

interface HeaderNavProps {
  activeTab: 'overview' | 'sales' | 'purchases' | 'reports';
  setActiveTab: (tab: 'overview' | 'sales' | 'purchases' | 'reports') => void;
  userEmail?: string;
  pendingCount?: number;
  pendingItems?: Array<{
    id: string;
    type: 'invoice' | 'bill';
    entityName: string;
    amount: number;
    date: string;
    status: string;
    receiptUrl?: string;
  }>;
}

export default function HeaderNav({ 
  activeTab, 
  setActiveTab, 
  userEmail = 'user@aibookkeeper.com',
  pendingCount = 0,
  pendingItems = []
}: HeaderNavProps) {
  const [mounted, setMounted] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when notification drawer is open
  useEffect(() => {
    if (showNotifications) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showNotifications]);

  // Close dropdowns / drawer on outside click or Escape key
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

  // Construct dynamic deep-link notification list
  const notifications = useMemo(() => {
    const list: NotificationItem[] = [];

    if (pendingItems && pendingItems.length > 0) {
      pendingItems.forEach(item => {
        if (item.type === 'bill') {
          list.push({
            id: item.id,
            type: 'bill',
            title: `Pending Expense: ${item.entityName || 'Vendor Bill'}`,
            description: `${Number(item.amount || 0).toLocaleString()} PKR expense draft awaiting your verification.`,
            amount: item.amount,
            date: item.date,
            read: readIds.has(item.id)
          });
        } else {
          list.push({
            id: item.id,
            type: 'invoice',
            title: `Pending Invoice: ${item.entityName || 'Customer Invoice'}`,
            description: `${Number(item.amount || 0).toLocaleString()} PKR invoice draft ready for review.`,
            amount: item.amount,
            date: item.date,
            read: readIds.has(item.id)
          });
        }
      });
    } else if (pendingCount > 0) {
      list.push({
        id: 'pending-generic-alert',
        type: 'bill',
        title: `${pendingCount} Pending Transaction${pendingCount > 1 ? 's' : ''}`,
        description: 'AI extracted new expense drafts awaiting your verification.',
        read: readIds.has('pending-generic-alert')
      });
    }

    return list;
  }, [pendingItems, pendingCount, readIds]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Deep-Link Routing Action Chain
  const handleNotificationClick = (item: NotificationItem) => {
    // 1. Mark as read
    setReadIds(prev => new Set(prev).add(item.id));

    // 2. Deep link route based on transaction type
    if (item.type === 'bill' || item.type === 'expense') {
      setActiveTab('purchases');
    } else if (item.type === 'invoice' || item.type === 'sale') {
      setActiveTab('sales');
    } else {
      setActiveTab('overview');
    }

    // 3. Automatically close drawer
    setShowNotifications(false);
  };

  const handleMarkAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
  };

  return (
    <>
      <header className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex flex-col items-center px-3 sm:px-6 md:px-12 pointer-events-none" role="banner">
        <div className="pointer-events-auto flex items-center justify-between gap-2 sm:gap-4 md:gap-8 h-16 px-3.5 sm:px-6 md:px-8 bg-white/85 backdrop-blur-2xl border border-white/80 rounded-full shadow-xl shadow-slate-200/50 transition-all w-full max-w-[1700px]">
          
          {/* LEFT: Logo & Brand Badge */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className="font-heading font-extrabold text-base sm:text-lg text-slate-900 tracking-tight flex items-center gap-0.5 truncate">
              Inscribe<span className="text-blue-600">AI</span>
            </span>
            <span className="hidden xl:inline-block text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
              Autonomous ERP
            </span>
          </div>

          {/* CENTER: Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 backdrop-blur-md p-1 rounded-full border border-slate-200/60" aria-label="Main navigation">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              aria-current={activeTab === 'overview' ? 'page' : undefined}
            >
              <LayoutDashboard className="w-4 h-4 text-blue-600" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'sales'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              aria-current={activeTab === 'sales' ? 'page' : undefined}
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
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'purchases'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              aria-current={activeTab === 'purchases' ? 'page' : undefined}
            >
              <Receipt className="w-4 h-4 text-indigo-600" />
              <span>Expenses & Bills</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-4 lg:px-5 py-2 rounded-full text-xs lg:text-sm font-medium transition-all cursor-pointer min-h-[44px] ${
                activeTab === 'reports'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
              aria-current={activeTab === 'reports' ? 'page' : undefined}
            >
              <BarChart3 className="w-4 h-4 text-purple-600" />
              <span>Reports</span>
            </button>
          </nav>

          {/* RIGHT: Notifications Bell & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-200">
            
            {/* Notifications Bell Button */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => { setShowNotifications(true); setShowUserDropdown(false); }}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors relative cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Notifications Drawer"
                aria-label="Notifications"
                aria-haspopup="dialog"
                aria-expanded={showNotifications}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white animate-pulse" />
                )}
              </button>
            </div>

            {/* User Profile Avatar */}
            <div className="relative" ref={userDropdownRef}>
              <button
                onClick={() => { setShowUserDropdown(!showUserDropdown); }}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors cursor-pointer border border-slate-200 min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="User Profile"
                aria-haspopup="true"
                aria-expanded={showUserDropdown}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {initials}
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 mr-1 hidden sm:block" />
              </button>

              {/* User Dropdown */}
              {showUserDropdown && (
                <div 
                  className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                  role="menu"
                  aria-label="User account options"
                >
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-500">Signed in as</p>
                    <p className="text-xs font-bold text-slate-900 truncate">{userEmail}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/dashboard/settings?tab=account"
                      role="menuitem"
                      onClick={() => setShowUserDropdown(false)}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" /> My Account
                    </Link>
                    <Link
                      href="/dashboard/settings?tab=app"
                      role="menuitem"
                      onClick={() => setShowUserDropdown(false)}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-400" /> App Settings
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
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
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg md:hidden cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
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
            className="pointer-events-auto md:hidden border border-slate-200 bg-white/95 backdrop-blur-2xl px-4 pt-3 pb-4 space-y-2 rounded-3xl shadow-2xl mt-2 w-full max-w-md mx-auto animate-in fade-in slide-in-from-top-3 duration-200"
            role="dialog"
            aria-label="Mobile Navigation Menu"
          >
            <button
              onClick={() => { setActiveTab('overview'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'overview' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className="w-5 h-5 text-blue-600" /> Overview Dashboard
            </button>

            <button
              onClick={() => { setActiveTab('sales'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'sales' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
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
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'purchases' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Receipt className="w-5 h-5 text-indigo-600" /> Expenses & Bills
            </button>

            <button
              onClick={() => { setActiveTab('reports'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'reports' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-5 h-5 text-purple-600" /> Financial Reports
            </button>
          </div>
        )}
      </header>

      {/* FULL-HEIGHT SLIDE-OVER NOTIFICATION DRAWER (PORTAL) */}
      {mounted && showNotifications && createPortal(
        <div className="fixed inset-0 z-[9999] flex justify-end bg-black/40 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in">
          {/* Backdrop dismiss click area */}
          <div 
            className="absolute inset-0 cursor-pointer" 
            onClick={() => setShowNotifications(false)} 
            aria-hidden="true" 
          />
          
          {/* Slide-over Drawer Panel */}
          <div 
            className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col z-10 border-l border-slate-200 animate-in slide-in-from-right duration-300 ease-out"
            role="dialog"
            aria-label="Notifications Drawer"
            aria-modal="true"
          >
            {/* Drawer Header (Fixed) */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base text-slate-900">Notifications</h2>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-xs font-bold bg-blue-600 text-white rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Real-time alerts & action items</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                  title="Close Notifications"
                  aria-label="Close Notifications"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3 min-h-0">
              {notifications.length > 0 && unreadCount > 0 ? (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-3.5 group ${
                      item.read 
                        ? 'border-slate-100 bg-slate-50/50 opacity-60 hover:opacity-100 hover:bg-slate-50' 
                        : 'border-slate-200/80 bg-white hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      item.type === 'bill' 
                        ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 border border-indigo-100' 
                        : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 border border-emerald-100'
                    }`}>
                      {item.type === 'bill' ? <Receipt className="w-5 h-5" /> : <FileSpreadsheet className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.type === 'bill' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {item.type === 'bill' ? 'Expense Draft' : 'Invoice Draft'}
                        </span>
                        {item.date && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {item.date}
                          </span>
                        )}
                      </div>

                      <h3 className={`text-sm font-bold truncate ${item.read ? 'text-slate-600' : 'text-slate-900'}`}>
                        {item.title}
                      </h3>
                      
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100">
                        <span className="text-xs text-blue-600 font-bold group-hover:text-blue-700 flex items-center gap-1">
                          Review in {item.type === 'bill' ? 'Expenses' : 'Revenue'} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                        </span>
                        {!item.read && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Action required
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3 text-emerald-600">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">All caught up!</h3>
                  <p className="text-xs text-slate-500 max-w-xs mt-1 leading-relaxed">
                    There are no pending invoices, bills, or unverified AI drafts requiring your attention.
                  </p>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span>InscribeAI Autonomous ERP</span>
              <span>Esc to close</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
