'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
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
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
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

    // 3. Automatically close dropdown
    setShowNotifications(false);
  };

  const handleMarkAllRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadIds(allIds);
  };

  return (
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

        {/* RIGHT: Notifications & User Profile */}
        <div className="flex items-center gap-1.5 sm:gap-3 pl-2 sm:pl-4 border-l border-slate-200">
          
          {/* Notifications Bell */}
          <div className="relative" ref={notificationsRef}>
            <button 
              onClick={() => { setShowNotifications(!showNotifications); setShowUserDropdown(false); }}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors relative cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Notifications"
              aria-label="Notifications"
              aria-haspopup="true"
              aria-expanded={showNotifications}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-amber-500 rounded-full ring-2 ring-white animate-pulse" />
              )}
            </button>

            {/* Notifications Dropdown (Fully Responsive on Mobile & Desktop) */}
            {showNotifications && (
              <div 
                className="fixed inset-x-4 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-w-full bg-white rounded-2xl shadow-2xl border border-slate-100 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[80vh] sm:max-h-96 flex flex-col"
                role="region"
                aria-label="Notifications panel"
              >
                <div className="px-4 pb-2 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer p-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto custom-scrollbar divide-y divide-slate-50 flex-1">
                  {notifications.length > 0 && unreadCount > 0 ? (
                    notifications.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`w-full text-left p-3.5 min-h-[48px] transition-colors cursor-pointer flex gap-3 items-start group ${
                          item.read 
                            ? 'opacity-60 bg-slate-50/50 hover:bg-slate-100/80' 
                            : 'bg-white hover:bg-slate-50 active:bg-slate-100'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          item.type === 'bill' 
                            ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100' 
                            : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100'
                        }`}>
                          {item.type === 'bill' ? <Receipt className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className={`text-xs font-bold truncate ${item.read ? 'text-slate-600' : 'text-slate-900'}`}>
                              {item.title}
                            </p>
                            {!item.read && (
                              <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {item.description}
                          </p>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[11px] text-blue-600 font-semibold group-hover:underline flex items-center gap-1">
                              Review in {item.type === 'bill' ? 'Expenses' : 'Revenue'} <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                            </span>
                            {item.date && (
                              <span className="text-[10px] text-slate-400">
                                {item.date}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">All caught up!</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">No pending drafts or alerts.</p>
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
                className="fixed inset-x-4 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-64 max-w-full bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                role="menu"
                aria-label="User account options"
              >
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-500">Signed in as</p>
                  <p className="text-xs font-bold text-slate-900 truncate">{userEmail}</p>
                </div>
                <div className="py-1">
                  <button
                    role="menuitem"
                    onClick={() => { setActiveTab('overview'); setShowUserDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-slate-400" /> My Account
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setActiveTab('reports'); setShowUserDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-slate-400" /> App Settings
                  </button>
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
  );
}
