'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2, MessageSquare, X } from 'lucide-react';
import HeaderNav from '@/components/layout/HeaderNav';
import BentoStatsPanel from '@/components/dashboard/BentoStatsPanel';
import AgingSummaryPanel from '@/components/dashboard/AgingSummaryPanel';
import AiChatPanel from '@/components/chat/AiChatPanel';
import SalesHub from '@/components/dashboard/SalesHub';
import PurchasesHub from '@/components/dashboard/PurchasesHub';
import ReportsHub from '@/components/dashboard/ReportsHub';
import PendingTable, { PendingItem } from '@/components/dashboard/PendingTable';
import AiChatLogModal from '@/components/dashboard/AiChatLogModal';

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string>('user@aibookkeeper.com');
  const [userName, setUserName] = useState<string>('Alex');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'purchases' | 'reports'>('overview');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [logModalTxId, setLogModalTxId] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Refresh dashboard data when navigating back to overview
  useEffect(() => {
    if (activeTab === 'overview' && userId) {
      fetchFinancials(userId);
    }
  }, [activeTab, userId]);

  async function fetchInitialData() {
    setIsLoading(true);
    
    // Fetch User
    const { data: { user } } = await supabase.auth.getUser();
    let currentUserId = null;
    if (user?.email) {
      setUserEmail(user.email);
      setUserId(user.id);
      currentUserId = user.id;

      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (metaName) {
        setUserName(metaName);
      } else {
        const fallback = user.email.split('@')[0];
        setUserName(fallback.charAt(0).toUpperCase() + fallback.slice(1));
      }
    }

    if (currentUserId) {
      await supabase.rpc('initialize_default_accounts', { p_user_id: currentUserId });
    }

    // Fetch Accounts
    const { data: accounts, error: accError } = await supabase.from('accounts').select('*');
    if (accError) {
      console.error("Error fetching accounts:", accError);
    } else if (accounts) {
      setChartOfAccounts(accounts);
    }
    
    if (currentUserId) {
      await fetchFinancials(currentUserId);
    } else {
      setIsLoading(false);
    }
  }

  async function fetchFinancials(uid?: string) {
    const activeUserId = uid || userId;
    if (!activeUserId) return;

    // Fetch Invoices
    const { data: invoicesData, error: invError } = await supabase
      .from('invoices')
      .select('*, customers(name)')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });
    
    if (invError) console.error("Error fetching invoices:", invError);
    else if (invoicesData) setInvoices(invoicesData);

    // Fetch Bills
    const { data: billData, error: billsError } = await supabase
      .from('bills')
      .select('*, suppliers(name)')
      .eq('user_id', activeUserId)
      .order('created_at', { ascending: false });

    if (billsError) console.error("Error fetching bills:", billsError);

    if (invoicesData) setInvoices(invoicesData.filter((i: any) => i.is_ai_verified));
    if (billData) setBills(billData.filter((b: any) => b.is_ai_verified));

    // Build Pending Items list
    const pending: PendingItem[] = [];
    if (invoicesData) {
      invoicesData.filter((i: any) => !i.is_ai_verified).forEach((i: any) => {
        pending.push({ id: i.id, type: 'invoice', entityName: i.customers?.name || 'Unknown', amount: i.total_amount, date: i.issue_date, status: i.status, receiptUrl: i.receipt_url });
      });
    }
    if (billData) {
      billData.filter((b: any) => !b.is_ai_verified).forEach((b: any) => {
        pending.push({ id: b.id, type: 'bill', entityName: b.suppliers?.name || 'Unknown', amount: b.total_amount, date: b.issue_date, status: b.status, receiptUrl: b.receipt_url });
      });
    }
    setPendingItems(pending.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setDataVersion(v => v + 1);

    setIsLoading(false);
  }

  // Real-time Sync
  useEffect(() => {
    if (!userId) return;
    const channel1 = supabase
      .channel(`public:invoices:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `user_id=eq.${userId}` }, () => {
        fetchFinancials();
      })
      .subscribe();

    const channel2 = supabase
      .channel(`public:bills:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `user_id=eq.${userId}` }, () => {
        fetchFinancials();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [supabase, userId]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-xs font-semibold text-gray-500">Loading AI Financial Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-50 font-sans text-slate-900 transition-colors duration-300">
      
      {/* Global Evolving Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] max-w-[800px] max-h-[800px] rounded-full bg-purple-500/20 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute top-[40%] -right-[10%] w-[40vw] h-[40vw] max-w-[600px] max-h-[600px] rounded-full bg-fuchsia-500/20 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '14s', animationDelay: '2s' }} />
        <div className="absolute -bottom-[20%] left-[20%] w-[60vw] h-[60vw] max-w-[900px] max-h-[900px] rounded-full bg-indigo-500/10 blur-[120px] lg:blur-[160px] animate-pulse" style={{ animationDuration: '18s', animationDelay: '4s' }} />
      </div>

      {/* Main Content Wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen pt-24 sm:pt-28">
        {/* GLOBAL HEADER */}
        <HeaderNav 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          userEmail={userEmail}
          pendingCount={pendingItems.length}
        />

        {/* MAIN DASHBOARD SPLIT CONTAINER */}
        <main className="flex-1 w-full max-w-[1700px] mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* DESKTOP SPLIT VIEW: Stats on Left, AI Chat on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start min-h-screen pb-12">
          
          {/* LEFT CONTENT AREA */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6 min-w-0">
            {activeTab === 'overview' && (
              <>
                <PendingTable items={pendingItems} onDataChanged={fetchFinancials} onViewLog={(id) => setLogModalTxId(id)} />
                <BentoStatsPanel
                  userName={userName}
                  userEmail={userEmail}
                  invoices={invoices}
                  bills={bills}
                  chartOfAccounts={chartOfAccounts}
                />
                <AgingSummaryPanel invoices={invoices} bills={bills} />
              </>
            )}
            {activeTab === 'sales' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <SalesHub />
              </div>
            )}
            {activeTab === 'purchases' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <PurchasesHub />
              </div>
            )}
            {activeTab === 'reports' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ReportsHub key={dataVersion} />
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR: Conversational AI Assistant Chat */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 h-[calc(100vh-8rem)] sticky top-28 pb-4 z-20">
            <AiChatPanel
              chartOfAccounts={chartOfAccounts}
              onDataChanged={fetchFinancials}
            />
          </div>

        </div>

      </main>

      {/* MOBILE AI CHAT FLOATING TOGGLE & SLIDE-UP DRAWER */}
      <div className="lg:hidden">
        <button
          onClick={() => setMobileChatOpen(!mobileChatOpen)}
          className="fixed bottom-6 right-6 z-50 px-4 py-3 min-h-[44px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-105 transition-all flex items-center gap-2 font-bold text-xs cursor-pointer"
        >
          <MessageSquare className="w-5 h-5" />
          <span>AI Assistant</span>
        </button>

        {mobileChatOpen && (
          <div className="fixed inset-0 z-[100] w-screen h-screen bg-black/50 backdrop-blur-sm flex flex-col justify-end p-2 sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl h-[85dvh] max-h-[85dvh] w-full max-w-lg mx-auto flex flex-col shadow-2xl overflow-hidden relative">
              <AiChatPanel
                chartOfAccounts={chartOfAccounts}
                onDataChanged={fetchFinancials}
                onClose={() => setMobileChatOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      {logModalTxId && (
        <AiChatLogModal txId={logModalTxId} onClose={() => setLogModalTxId(null)} />
      )}
      </div>
    </div>
  );
}
