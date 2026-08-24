'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
 FileSpreadsheet, 
 Download, 
 Loader2, 
 DollarSign, 
 Scale, 
 FolderTree, 
 Landmark, 
 CheckCircle2, 
 Sparkles, 
 TrendingUp, 
 BarChart3, 
 Calendar,
 Layers,
 Wallet
} from 'lucide-react';
import {
 ResponsiveContainer,
 AreaChart,
 Area,
 XAxis,
 YAxis,
 Tooltip,
 CartesianGrid,
 Legend
} from 'recharts';
import ChartOfAccountsManager from './ChartOfAccountsManager';
import ExportDataModal from './ExportDataModal';
import { fetchWithCache, invalidateCache } from '@/lib/cache';

type Tab = 'chart_of_accounts' | 'cashbook' | 'pnl' | 'balance_sheet' | 'trial_balance' | 'ledger';

export default function ReportsHub() {
 const [activeTab, setActiveTab] = useState<Tab>('chart_of_accounts');
 const [journalEntries, setJournalEntries] = useState<any[]>([]);
 const [financials, setFinancials] = useState<any>(null);
 const [balanceSheet, setBalanceSheet] = useState<any>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [isExportModalOpen, setIsExportModalOpen] = useState(false);

 // Balance Sheet As-Of-Date State
 const [asOfDate, setAsOfDate] = useState<string>(new Date().toISOString().split('T')[0]);
 const [isLoadingBs, setIsLoadingBs] = useState(false);

 // Time-Series State
 const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
 const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'ytd' | 'all'>('all');
 const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
 const [isLoadingTimeSeries, setIsLoadingTimeSeries] = useState(false);

 // AI Insights State
 const [insights, setInsights] = useState<string[] | null>(null);
 const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

 // Cashbook View State
 const [cashbookSummary, setCashbookSummary] = useState<any>(null);
 const [cashbookEntries, setCashbookEntries] = useState<any[]>([]);
 const [cashAccountFilter, setCashAccountFilter] = useState<string>('all');
 const [isLoadingCashbook, setIsLoadingCashbook] = useState(false);

 const supabase = createBrowserClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchTimeSeries(timeframe, timeRange);
  }, [timeframe, timeRange]);

  useEffect(() => {
    fetchBalanceSheet(asOfDate);
  }, [asOfDate]);

  async function fetchBalanceSheet(targetDate?: string) {
    const dateQuery = targetDate || asOfDate;
    setIsLoadingBs(true);
    try {
      const bsData = await fetchWithCache(`/api/reports/balance-sheet?asOfDate=${dateQuery}`, undefined, 60000);
      if (bsData) {
        setBalanceSheet(bsData);
      }
    } catch (e) {
      console.error("Failed to fetch balance sheet:", e);
    } finally {
      setIsLoadingBs(false);
    }
  }

  async function fetchCashbookData() {
    setIsLoadingCashbook(true);
    try {
      const summaryData = await fetchWithCache('/api/reports/cashbook', undefined, 60000);
      if (summaryData) {
        setCashbookSummary(summaryData);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name, is_cash_account, type')
        .eq('user_id', user.id);

      const cashAccountIds = (accounts || []).filter(a => {
        if (a.type !== 'asset') return false;
        if (a.is_cash_account) return true;
        const lower = a.name.toLowerCase();
        return lower === 'main bank account' || lower === 'petty cash' || lower.includes('bank') || lower.includes('cash') || lower.includes('wallet') || lower.includes('paypal') || lower.includes('easypaisa');
      }).map(a => a.id);

      if (cashAccountIds.length > 0) {
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('*, journal_entries(date, description, reference_type), accounts(name)')
          .in('account_id', cashAccountIds)
          .order('created_at', { ascending: true });

        setCashbookEntries(lines || []);
      } else {
        setCashbookEntries([]);
      }
    } catch (e) {
      console.error("Failed to fetch cashbook details:", e);
    } finally {
      setIsLoadingCashbook(false);
    }
  }

  const processedCashbookEntries = useMemo(() => {
    let filtered = cashbookEntries;
    if (cashAccountFilter !== 'all') {
      filtered = cashbookEntries.filter(l => l.account_id === cashAccountFilter);
    }

    let currentBalance = 0;
    const withBalance = filtered.map(line => {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      currentBalance += (debit - credit);
      return {
        ...line,
        running_balance: currentBalance
      };
    });

    return [...withBalance].reverse();
  }, [cashbookEntries, cashAccountFilter]);

  async function fetchTimeSeries(tf: 'daily' | 'weekly' | 'monthly', range: '7d' | '30d' | 'ytd' | 'all') {
    setIsLoadingTimeSeries(true);
    try {
      const data = await fetchWithCache(`/api/reports/time-series?timeframe=${tf}&range=${range}`, undefined, 60000);
      if (data && data.series) {
        setTimeSeriesData(data.series);
      }
    } catch (e) {
      console.error("Failed to fetch time-series data:", e);
    } finally {
      setIsLoadingTimeSeries(false);
    }
  }

  async function fetchInsights() {
    setIsGeneratingInsights(true);
    try {
      const data = await fetchWithCache('/api/reports/insights', undefined, 120000);
      if (data && data.insights) {
        setInsights(data.insights);
      }
    } catch (e) {
      console.error("Failed to fetch AI insights:", e);
    } finally {
      setIsGeneratingInsights(false);
    }
  }

  async function fetchData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Parallel pre-fetch across all reports
      await Promise.all([
        supabase
          .from('journal_entries')
          .select('*, journal_lines(*, accounts(name, type))')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .then(({ data }) => { if (data) setJournalEntries(data); }),
        fetchWithCache('/api/reports/financials', undefined, 60000)
          .then(data => { if (data) setFinancials(data); }),
        fetchWithCache(`/api/reports/balance-sheet?asOfDate=${asOfDate}`, undefined, 60000)
          .then(data => { if (data) setBalanceSheet(data); }),
        fetchCashbookData(),
        fetchWithCache(`/api/reports/time-series?timeframe=${timeframe}&range=${timeRange}`, undefined, 60000)
          .then(data => { if (data?.series) setTimeSeriesData(data.series); })
      ]);

      // Fire AI insights in background
      fetchInsights();
    } catch (err) {
      console.error("Error fetching report data:", err);
    } finally {
      setIsLoading(false);
    }
  }

 return (
 <div className="space-y-6 min-w-0">
 
 {/* HEADER */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl min-w-0">
 <div>
 <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
 Accounting & Financial Ledger
 </h1>
 <p className="text-xs text-gray-500 mt-1">
 General Ledger, Chart of Accounts, Cash Book, P&L, time-series trends, and certified Balance Sheet.
 </p>
 </div>

 <button 
  onClick={() => setIsExportModalOpen(true)}
  className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-sm font-semibold transition-all cursor-pointer shrink-0"
 >
 <Download className="w-4 h-4" /> Export Data
 </button>
 </div>

 <ExportDataModal 
   isOpen={isExportModalOpen} 
   onClose={() => setIsExportModalOpen(false)} 
 />

 {/* AI CONTROLLER INSIGHTS BANNER */}
 <div className="bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-slate-900/90 backdrop-blur-2xl border border-purple-500/30 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-purple-500/20 pb-4 mb-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-inner">
 <Sparkles className="w-5 h-5" />
 </div>
 <div>
 <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2">
 AI Controller Insights
 <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-400/20 text-purple-200 border border-purple-400/30">CFO Intelligence</span>
 </h2>
 <p className="text-xs text-purple-200/80">Real-time financial anomaly detection, cash flow warnings & growth wins.</p>
 </div>
 </div>

 <button
 onClick={fetchInsights}
 disabled={isGeneratingInsights}
 className="px-4 py-2.5 min-h-[44px] bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer shrink-0"
 >
 {isGeneratingInsights ? (
 <>
 <Loader2 className="w-4 h-4 animate-spin" />
 Analyzing Financials...
 </>
 ) : (
 <>
 <Sparkles className="w-4 h-4" />
 Generate AI Insights
 </>
 )}
 </button>
 </div>

 {isGeneratingInsights && (
 <div className="space-y-3 py-2 animate-pulse">
 <div className="h-4 bg-purple-500/20 rounded-md w-3/4" />
 <div className="h-4 bg-purple-500/20 rounded-md w-5/6" />
 <div className="h-4 bg-purple-500/20 rounded-md w-2/3" />
 </div>
 )}

 {!isGeneratingInsights && insights && insights.length > 0 && (
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
 {insights.map((bullet, idx) => (
 <div key={idx} className="bg-purple-950/40 border border-purple-500/30 p-3.5 rounded-xl space-y-1.5 backdrop-blur-xs">
 <span className="text-[10px] font-extrabold text-purple-400 block uppercase tracking-wider">Insight #{idx + 1}</span>
 <p className="text-purple-100 font-medium leading-relaxed">{bullet}</p>
 </div>
 ))}
 </div>
 )}

 {!isGeneratingInsights && !insights && (
 <p className="text-xs text-purple-300/70 italic">Click "Generate AI Insights" to trigger Gemini CFO analysis on your double-entry ledger.</p>
 )}
 </div>

 {/* TABS */}
 <div className="flex flex-wrap gap-2 min-w-0">
 <button
 onClick={() => setActiveTab('chart_of_accounts')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'chart_of_accounts' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <FolderTree className="w-4 h-4" /> Chart of Accounts
 </button>
 <button
 onClick={() => setActiveTab('cashbook')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${activeTab === 'cashbook' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <Wallet className="w-4 h-4" /> Dedicated Cash Book
 </button>
 <button
 onClick={() => setActiveTab('pnl')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <FileSpreadsheet className="w-4 h-4" /> Profit & Loss
 </button>
 <button
 onClick={() => setActiveTab('balance_sheet')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${activeTab === 'balance_sheet' ? 'bg-purple-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <Landmark className="w-4 h-4" /> Balance Sheet
 </button>
 <button
 onClick={() => setActiveTab('trial_balance')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'trial_balance' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <Scale className="w-4 h-4" /> Trial Balance
 </button>
 <button
 onClick={() => setActiveTab('ledger')}
 className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === 'ledger' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
 >
 <DollarSign className="w-4 h-4" /> General Ledger
 </button>
 </div>

 {/* TAB CONTENT AREA */}
 <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl overflow-hidden min-h-[500px] min-w-0">
 
 {isLoading ? (
 <div className="flex flex-col items-center justify-center py-20 text-blue-600">
 <Loader2 className="w-8 h-8 animate-spin" />
 <span className="text-xs font-semibold text-gray-500 mt-2">Computing Double-Entry Statements...</span>
 </div>
 ) : (
 <>
 {/* CHART OF ACCOUNTS MANAGER HUB */}
 {activeTab === 'chart_of_accounts' && (
 <div className="p-4 sm:p-6 min-w-0">
 <ChartOfAccountsManager />
 </div>
 )}

 {/* DEDICATED CASH BOOK TAB */}
 {activeTab === 'cashbook' && (
 <div className="p-4 sm:p-6 space-y-6 min-w-0">
 
 {/* CASHBOOK SUMMARY CARDS */}
 {cashbookSummary && (
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 min-w-0">
 <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl min-w-0">
 <p className="text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
 <Wallet className="w-4 h-4" /> Total Liquid Cash Available
 </p>
 <h3 className="text-2xl font-black text-emerald-950 truncate">
 {cashbookSummary.totalCashBalance?.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-emerald-700">PKR</span>
 </h3>
 </div>

 <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl min-w-0">
 <p className="text-blue-700 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
 <TrendingUp className="w-4 h-4" /> Total Cash In (Debits)
 </p>
 <h3 className="text-2xl font-black text-blue-950 truncate">
 {cashbookEntries.reduce((s, l) => s + Number(l.debit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-blue-700">PKR</span>
 </h3>
 </div>

 <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl min-w-0">
 <p className="text-rose-700 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
 <DollarSign className="w-4 h-4" /> Total Cash Out (Credits)
 </p>
 <h3 className="text-2xl font-black text-rose-950 truncate">
 {cashbookEntries.reduce((s, l) => s + Number(l.credit || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-rose-700">PKR</span>
 </h3>
 </div>
 </div>
 )}

 {/* ACCOUNT FILTER BAR */}
 <div className="bg-white/70 backdrop-blur-md border border-gray-200 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
 <div>
 <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
 <Wallet className="w-4 h-4 text-emerald-600" /> Cash Book Money Flow Register
 </h3>
 <p className="text-xs text-gray-500 mt-0.5">Chronological record of all liquid money movements into and out of cash & bank accounts.</p>
 </div>

 <div className="flex items-center gap-2 w-full sm:w-auto">
 <label className="text-xs font-bold text-gray-700 whitespace-nowrap">Filter Account:</label>
 <select
 value={cashAccountFilter}
 onChange={(e) => setCashAccountFilter(e.target.value)}
 className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer w-full sm:w-auto"
 >
 <option value="all">All Cash & Bank Accounts</option>
 {cashbookSummary?.accounts?.map((acc: any) => (
 <option key={acc.id} value={acc.id}>{acc.name} ({acc.balance.toLocaleString()} PKR)</option>
 ))}
 </select>
 </div>
 </div>

 {/* CASH BOOK TABLE */}
 <div className="overflow-x-auto custom-scrollbar min-w-0 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
 {isLoadingCashbook ? (
 <div className="flex flex-col items-center justify-center py-16 text-emerald-600">
 <Loader2 className="w-8 h-8 animate-spin" />
 <span className="text-xs font-semibold text-gray-500 mt-2">Loading Cash Book Register...</span>
 </div>
 ) : (
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[750px]">
 <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold border-b border-gray-200">
 <tr>
 <th className="px-6 py-3.5">Date</th>
 <th className="px-6 py-3.5">Account</th>
 <th className="px-6 py-3.5">Description / Particulars</th>
 <th className="px-6 py-3.5">Reference</th>
 <th className="px-6 py-3.5 text-right">Cash In (Debit)</th>
 <th className="px-6 py-3.5 text-right">Cash Out (Credit)</th>
 <th className="px-6 py-3.5 text-right">Running Balance</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 text-gray-700 text-xs">
 {processedCashbookEntries.length === 0 ? (
 <tr>
 <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
 No cash or bank transactions found for the selected account.
 </td>
 </tr>
 ) : (
 processedCashbookEntries.map((entry, idx) => (
 <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
 <td className="px-6 py-3.5 font-medium text-gray-500">{entry.journal_entries?.date}</td>
 <td className="px-6 py-3.5 font-bold text-gray-900">
 <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[11px]">
 {entry.accounts?.name}
 </span>
 </td>
 <td className="px-6 py-3.5 font-semibold text-gray-800 max-w-xs truncate" title={entry.journal_entries?.description}>
 {entry.journal_entries?.description || 'Cash Transaction'}
 </td>
 <td className="px-6 py-3.5 text-gray-400 font-mono text-[11px]">{entry.journal_entries?.reference_type}</td>
 <td className="px-6 py-3.5 text-right font-extrabold text-emerald-600">
 {Number(entry.debit) > 0 ? `+${Number(entry.debit).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR` : '-'}
 </td>
 <td className="px-6 py-3.5 text-right font-extrabold text-rose-600">
 {Number(entry.credit) > 0 ? `-${Number(entry.credit).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR` : '-'}
 </td>
 <td className="px-6 py-3.5 text-right font-black text-gray-900 text-sm">
 {entry.running_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 )}
 </div>

 </div>
 )}

 {/* GENERAL LEDGER TAB */}
 {activeTab === 'ledger' && (
 <div className="overflow-x-auto custom-scrollbar min-w-0 p-0">
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[700px]">
 <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
 <tr>
 <th className="px-6 py-4">Date</th>
 <th className="px-6 py-4">Description</th>
 <th className="px-6 py-4">Reference</th>
 <th className="px-6 py-4">Account Breakdown</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 text-gray-700">
 {journalEntries.length === 0 ? (
 <tr>
 <td colSpan={4} className="px-6 py-16 text-center text-gray-400">
 No posted journal entries found. Approve a pending invoice/bill to generate double-entry records.
 </td>
 </tr>
 ) : (
 journalEntries.map((entry) => (
 <tr key={entry.id} className="hover:bg-gray-50 transition-colors align-top">
 <td className="px-6 py-4 text-xs text-gray-500 font-medium">
 {entry.date}
 </td>
 <td className="px-6 py-4 font-semibold text-gray-900">
 {entry.description}
 </td>
 <td className="px-6 py-4 text-xs font-mono text-gray-400">
 {entry.reference_type}
 </td>
 <td className="px-6 py-4 p-0">
 <table className="w-full text-xs">
 <thead>
 <tr className="text-gray-400 border-b border-gray-100">
 <th className="px-6 py-2 text-left font-semibold">Account</th>
 <th className="px-6 py-2 text-right font-semibold">Debit</th>
 <th className="px-6 py-2 text-right font-semibold">Credit</th>
 </tr>
 </thead>
 <tbody>
 {entry.journal_lines?.map((line: any) => (
 <tr key={line.id} className="border-b border-gray-50 last:border-0">
 <td className="px-6 py-3 font-medium text-gray-800">
 {line.accounts?.name}
 </td>
 <td className="px-6 py-3 text-right text-gray-900 w-32">
 {line.debit > 0 ? line.debit.toLocaleString() : '-'}
 </td>
 <td className="px-6 py-3 text-right text-gray-900 w-32">
 {line.credit > 0 ? line.credit.toLocaleString() : '-'}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 )}

 {/* P&L TAB WITH DYNAMIC TIME-SERIES REPORTING */}
 {activeTab === 'pnl' && financials && (
 <div className="p-4 sm:p-8 min-w-0 space-y-8">
 
 {/* TIMEFRAME & RANGE CONTROL BAR */}
 <div className="bg-white/70 backdrop-blur-md border border-gray-200 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
 <div className="flex items-center gap-2">
 <BarChart3 className="w-5 h-5 text-blue-600" />
 <span className="text-sm font-extrabold text-gray-900">Dynamic Time-Series Analytics</span>
 </div>

 <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Timeframe Selector */}
            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-bold items-center">
              {(['daily', 'weekly', 'monthly'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3.5 py-2 min-h-[36px] rounded-lg capitalize transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${timeframe === tf ? 'bg-white text-blue-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {tf}
                </button>
              ))}
            </div>

 {/* Range Selector */}
 <select
 value={timeRange}
 onChange={(e: any) => setTimeRange(e.target.value)}
 className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
 >
 <option value="7d">Last 7 Days</option>
 <option value="30d">Last 30 Days</option>
 <option value="ytd">Year-to-Date (YTD)</option>
 <option value="all">All Time</option>
 </select>
 </div>
 </div>

 {/* RECHARTS TIME-SERIES TREND CHART */}
 <div className="bg-white/80 backdrop-blur-md border border-blue-100 p-6 rounded-2xl shadow-xs space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
 <TrendingUp className="w-4 h-4 text-emerald-600" /> Financial Performance Trend
 </h3>
 <p className="text-xs text-gray-500 mt-0.5">Revenue, Operating Expenses, and Net Profit ({timeframe.toUpperCase()} buckets)</p>
 </div>
 </div>

 <div className="h-72 w-full pt-2">
 {isLoadingTimeSeries ? (
 <div className="flex flex-col items-center justify-center h-full text-blue-600">
 <Loader2 className="w-6 h-6 animate-spin" />
 </div>
 ) : timeSeriesData.length === 0 ? (
 <div className="flex items-center justify-center h-full text-xs text-gray-400">
 No financial activity recorded for the selected timeframe.
 </div>
 ) : (
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
 <defs>
 <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
 <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
 </linearGradient>
 <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
 <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
 </linearGradient>
 <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
 <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
 <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
 <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toLocaleString()}`} />
 <Tooltip 
 contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
 formatter={(value: any) => [`${Number(value).toLocaleString()} PKR`, '']}
 />
 <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
 <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
 <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExp)" strokeWidth={2} />
 <Area type="monotone" dataKey="net_profit" name="Net Profit" stroke="#3b82f6" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
 </AreaChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 min-w-0">
 <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl min-w-0">
 <p className="text-blue-600 text-sm font-semibold mb-1">Gross Profit</p>
 <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-900 truncate">
 {financials.profit_and_loss.gross_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
 </h3>
 </div>
 <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl min-w-0">
 <p className="text-emerald-600 text-sm font-semibold mb-1">Net Profit</p>
 <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-900 truncate">
 {financials.profit_and_loss.net_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
 </h3>
 </div>
 </div>

 <div className="space-y-6 min-w-0">
 {/* Revenue */}
 <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
 <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
 <span className="truncate">Revenue</span>
 <span className="shrink-0">{financials.profit_and_loss.revenue.toLocaleString()}</span>
 </div>
 <div className="divide-y divide-gray-50">
 {financials.profit_and_loss.revenue_accounts.map((acc: any) => (
 <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50 min-w-0 gap-2">
 <span className="truncate">{acc.name}</span>
 <span className="shrink-0">{acc.balance.toLocaleString()}</span>
 </div>
 ))}
 </div>
 </div>

 {/* COGS */}
 <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
 <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
 <span className="truncate">Cost of Goods Sold</span>
 <span className="shrink-0">{financials.profit_and_loss.cogs.toLocaleString()}</span>
 </div>
 </div>

 {/* Gross Profit Subtotal */}
 <div className="px-6 py-4 flex justify-between font-extrabold text-blue-900 text-base sm:text-lg min-w-0 gap-2">
 <span className="truncate">Gross Profit</span>
 <span className="shrink-0">{financials.profit_and_loss.gross_profit.toLocaleString()}</span>
 </div>

 {/* Operating Expenses */}
 <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
 <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
 <span className="truncate">Operating Expenses</span>
 <span className="shrink-0">{financials.profit_and_loss.operating_expenses.toLocaleString()}</span>
 </div>
 <div className="divide-y divide-gray-50">
 {financials.profit_and_loss.operating_expense_accounts.map((acc: any) => (
 <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50 min-w-0 gap-2">
 <span className="truncate">{acc.name}</span>
 <span className="shrink-0">{acc.balance.toLocaleString()}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Net Profit Subtotal */}
 <div className="px-6 py-4 flex justify-between font-black text-emerald-900 text-lg sm:text-xl border-t-2 border-emerald-500 pt-6 min-w-0 gap-2">
 <span className="truncate">Net Profit</span>
 <span className="shrink-0">{financials.profit_and_loss.net_profit.toLocaleString()} PKR</span>
 </div>
 </div>
 </div>
 )}

 {/* BALANCE SHEET TAB */}
 {activeTab === 'balance_sheet' && balanceSheet && (
 <div className="p-4 sm:p-8 space-y-6 min-w-0">
 
 {/* BALANCING STATUS BANNER */}
 <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${balanceSheet.is_balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
 <div className="flex items-center gap-3">
 <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${balanceSheet.is_balanced ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
 <Scale className="w-5 h-5" />
 </div>
 <div>
 <h4 className="font-extrabold text-sm sm:text-base">
 {balanceSheet.is_balanced ? 'Books are Balanced! Total Assets equal Total Liabilities + Equity.' : 'Imbalance Detected in Ledger!'}
 </h4>
 <p className="text-xs opacity-80">
 Official Statement of Financial Position &middot; Currency: {balanceSheet.currency}
 </p>
 </div>
 </div>
 <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${balanceSheet.is_balanced ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-red-100 border-red-300 text-red-800'}`}>
 {balanceSheet.is_balanced ? 'BALANCED ✅' : 'ACTION REQUIRED ⚠️'}
 </span>
 </div>

 {/* STATEMENT HEADER */}
 <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
 <div>
 <span className="text-[10px] font-bold text-purple-400 tracking-widest uppercase block">FINANCIAL STATEMENT</span>
 <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
 <Landmark className="w-5 h-5 text-purple-400" /> Statement of Financial Position
 </h2>
 <p className="text-xs text-gray-400 mt-1">Official Certified Double-Entry Balance Sheet</p>
 </div>
 <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
 <div className="flex items-center gap-2 bg-gray-800/90 border border-gray-700/80 px-3 py-1.5 rounded-xl shadow-inner">
 <label htmlFor="asOfDateInput" className="text-[11px] font-bold text-gray-300 uppercase tracking-wider shrink-0">As Of Date:</label>
 <input 
 id="asOfDateInput"
 type="date"
 value={asOfDate}
 onChange={(e) => {
 const val = e.target.value;
 if (val) {
 setAsOfDate(val);
 fetchBalanceSheet(val);
 }
 }}
 className="bg-gray-900 text-purple-300 font-extrabold text-xs rounded-lg px-2.5 py-1 border border-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
 />
 </div>
 </div>
 </div>

 {/* THREE FINANCIAL SECTIONS */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
 
 {/* ASSETS SECTION */}
 <div className="bg-white/80 backdrop-blur-md border border-blue-100 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between min-w-0">
 <div>
 <div className="flex items-center justify-between pb-3 border-b border-blue-100 mb-3 min-w-0 gap-2">
 <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
 <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" /> ASSETS
 </h3>
 <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
 Debit
 </span>
 </div>
 <div className="divide-y divide-gray-100 text-xs sm:text-sm">
 {balanceSheet.assets.map((acc: any) => (
 <div key={acc.id} className="py-2.5 flex justify-between items-center text-gray-700 hover:bg-gray-50/80 px-1 rounded-lg min-w-0 gap-2">
 <span className="font-medium truncate">{acc.name}</span>
 <span className="font-bold text-gray-900 shrink-0">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
 </div>
 ))}
 </div>
 </div>
 <div className="pt-3 border-t-2 border-blue-600 flex justify-between items-center font-black text-sm sm:text-base text-blue-950 min-w-0 gap-2 mt-4">
 <span className="truncate uppercase tracking-wider text-xs">TOTAL ASSETS</span>
 <span className="shrink-0">{balanceSheet.totals.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
 </div>
 </div>

 {/* LIABILITIES SECTION */}
 <div className="bg-white/80 backdrop-blur-md border border-amber-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-w-0">
 <div>
 <div className="flex items-center justify-between pb-3 border-b border-amber-100 mb-3 min-w-0 gap-2">
 <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
 <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" /> LIABILITIES
 </h3>
 <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
 Credit
 </span>
 </div>
 <div className="divide-y divide-gray-100 text-xs sm:text-sm">
 {balanceSheet.liabilities.map((acc: any) => (
 <div key={acc.id} className="py-2.5 flex justify-between items-center text-gray-700 hover:bg-gray-50/80 px-1 rounded-lg min-w-0 gap-2">
 <span className="font-medium truncate">{acc.name}</span>
 <span className="font-bold text-gray-900 shrink-0">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
 </div>
 ))}
 </div>
 </div>
 <div className="pt-3 border-t-2 border-amber-600 flex justify-between items-center font-black text-sm sm:text-base text-amber-950 min-w-0 gap-2 mt-4">
 <span className="truncate uppercase tracking-wider text-xs">TOTAL LIABILITIES</span>
 <span className="shrink-0">{balanceSheet.totals.total_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
 </div>
 </div>

 {/* EQUITY SECTION */}
 <div className="bg-white/80 backdrop-blur-md border border-purple-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-w-0">
 <div>
 <div className="flex items-center justify-between pb-3 border-b border-purple-100 mb-3 min-w-0 gap-2">
 <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
 <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" /> EQUITY
 </h3>
 <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
 Credit
 </span>
 </div>
 <div className="divide-y divide-gray-100 text-xs sm:text-sm">
 {balanceSheet.equity.map((acc: any) => (
 <div key={acc.id} className={`py-2.5 flex justify-between items-center px-1 rounded-lg min-w-0 gap-2 ${acc.is_net_income ? 'bg-emerald-50/80 font-semibold text-emerald-900 border border-emerald-100' : 'text-gray-700 hover:bg-gray-50/80'}`}>
 <span className="font-medium truncate">{acc.name}</span>
 <span className={`font-bold shrink-0 ${acc.is_net_income ? 'text-emerald-700' : 'text-gray-900'}`}>{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
 </div>
 ))}
 </div>
 </div>
 <div className="pt-3 border-t-2 border-purple-600 flex justify-between items-center font-black text-sm sm:text-base text-purple-950 min-w-0 gap-2 mt-4">
 <span className="truncate uppercase tracking-wider text-xs">TOTAL EQUITY</span>
 <span className="shrink-0">{balanceSheet.totals.total_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
 </div>
 </div>

 </div>

 {/* ACCOUNTING EQUATION FOOTER CHECK */}
 <div className="bg-slate-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xl">
 <div>
 <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">TOTAL LIABILITIES & EQUITY</span>
 <span className="text-xl sm:text-2xl font-black text-purple-300">
 {balanceSheet.totals.total_liabilities_and_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
 </span>
 </div>
 <div className="flex items-center gap-3">
 <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
 <CheckCircle2 className="w-4 h-4 text-emerald-400" />
 Equal to Total Assets ({balanceSheet.totals.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR)
 </span>
 </div>
 </div>

 </div>
 )}

 {/* TRIAL BALANCE TAB */}
 {activeTab === 'trial_balance' && financials && (
 <div className="overflow-x-auto custom-scrollbar min-w-0 p-0">
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
 <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
 <tr>
 <th className="px-6 py-4">Account</th>
 <th className="px-6 py-4 w-32">Type</th>
 <th className="px-6 py-4 text-right w-40">Debit</th>
 <th className="px-6 py-4 text-right w-40">Credit</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100 text-gray-700">
 {financials.trial_balance.map((acc: any) => (
 <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
 <td className="px-6 py-3 font-medium text-gray-900">{acc.name}</td>
 <td className="px-6 py-3 text-gray-500 uppercase text-xs">{acc.type}</td>
 <td className="px-6 py-3 text-right">{acc.debits > 0 ? acc.debits.toLocaleString() : '-'}</td>
 <td className="px-6 py-3 text-right">{acc.credits > 0 ? acc.credits.toLocaleString() : '-'}</td>
 </tr>
 ))}
 {/* TOTAL ROW */}
 <tr className="bg-gray-50 font-extrabold text-gray-900 text-base">
 <td className="px-6 py-4" colSpan={2}>TOTAL</td>
 <td className="px-6 py-4 text-right">{financials.total_debits.toLocaleString()} PKR</td>
 <td className="px-6 py-4 text-right">{financials.total_credits.toLocaleString()} PKR</td>
 </tr>
 </tbody>
 </table>
 <div className="p-6 bg-white border-t border-gray-100">
 {financials.total_debits === financials.total_credits ? (
 <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100">
 <Scale className="w-5 h-5 shrink-0" /> Debits equal Credits. Books are balanced!
 </div>
 ) : (
 <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 p-3 rounded-xl border border-red-100">
 <Scale className="w-5 h-5 shrink-0" /> Imbalance Detected! Difference: {Math.abs(financials.total_debits - financials.total_credits).toLocaleString()} PKR
 </div>
 )}
 </div>
 </div>
 )}

 </>
 )}

 </div>

 </div>
 );
}
