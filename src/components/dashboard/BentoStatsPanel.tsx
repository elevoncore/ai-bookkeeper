'use client';

import { useMemo, useState, useEffect } from 'react';
import { 
 Wallet, 
 Clock, 
 CheckCircle, 
 TrendingUp, 
 ArrowUpRight, 
 PieChart as PieIcon, 
 BarChart2, 
 Sparkles
} from 'lucide-react';
import { 
 AreaChart, 
 Area, 
 XAxis, 
 YAxis, 
 Tooltip, 
 ResponsiveContainer, 
 PieChart, 
 Pie, 
 Cell 
} from 'recharts';
import { parseToCents, formatFromCents } from '@/utils/currency';
import CashbookWidget from '@/components/dashboard/CashbookWidget';

type Invoice = {
 id: string; total_amount: number; balance_due: number; issue_date: string; status: string;
 customers?: { name: string };
};

type Bill = {
 id: string; total_amount: number; balance_due: number; issue_date: string; status: string;
 suppliers?: { name: string };
};

interface BentoStatsPanelProps {
 userName?: string;
 userEmail?: string;
 invoices: Invoice[];
 bills: Bill[];
 chartOfAccounts: any[];
 forceMobileView?: boolean;
 forceDesktopView?: boolean;
}

const CATEGORY_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1'];

export default function BentoStatsPanel({
 userName = 'Alex',
 userEmail = 'user@aibookkeeper.com',
 invoices,
 bills,
 chartOfAccounts,
 forceMobileView = false,
 forceDesktopView = false
}: BentoStatsPanelProps) {
 const [totalLiquidCash, setTotalLiquidCash] = useState<number | null>(null);

 useEffect(() => {
 async function loadCash() {
 try {
 const res = await fetch('/api/reports/cashbook');
 if (res.ok) {
 const json = await res.json();
 setTotalLiquidCash(json.totalCashBalance ?? 0);
 }
 } catch (e) {}
 }
 loadCash();
 }, []);

 // Compute metrics securely using cents to avoid float drift
 const totalRevenue = useMemo(() => {
 const rawCents = invoices.reduce((sum, inv) => sum + parseToCents(inv.total_amount || 0), 0);
 return rawCents / 100;
 }, [invoices]);

 const totalExpenses = useMemo(() => {
 const rawCents = bills.reduce((sum, bill) => sum + parseToCents(bill.total_amount || 0), 0);
 return rawCents / 100;
 }, [bills]);

 const pendingReceivables = useMemo(() => {
 const rawCents = invoices.reduce((sum, inv) => sum + parseToCents(inv.balance_due || 0), 0);
 return rawCents / 100;
 }, [invoices]);

 const pendingPayables = useMemo(() => {
 const rawCents = bills.reduce((sum, bill) => sum + parseToCents(bill.balance_due || 0), 0);
 return rawCents / 100;
 }, [bills]);

 const primaryCurrency = 'PKR';

 // Format data for Spend Trend Area Chart
 const trendData = useMemo(() => {
 const dateMap = new Map<string, { revenue: number, expenses: number }>();
 invoices.forEach(i => {
 if (!i.issue_date) return;
 const existing = dateMap.get(i.issue_date) || { revenue: 0, expenses: 0 };
 existing.revenue += i.total_amount;
 dateMap.set(i.issue_date, existing);
 });
 bills.forEach(b => {
 if (!b.issue_date) return;
 const existing = dateMap.get(b.issue_date) || { revenue: 0, expenses: 0 };
 existing.expenses += b.total_amount;
 dateMap.set(b.issue_date, existing);
 });

 return Array.from(dateMap.entries())
 .sort((a, b) => a[0].localeCompare(b[0]))
 .slice(-7)
 .map(([date, data]) => ({
 name: date.split('-').slice(1).join('/'),
 revenue: data.revenue,
 expenses: data.expenses
 }));
 }, [invoices, bills]);

 return (
 <div className="space-y-6 min-w-0">
 
 {/* PERSONALIZED GREETING HEADER */}
 <div className={`flex flex-col ${forceMobileView ? '' : forceDesktopView ? 'flex-row' : 'sm:flex-row'} justify-between items-start ${forceMobileView ? '' : forceDesktopView ? 'items-center' : 'sm:items-center'} gap-4 bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 sm:p-6 rounded-2xl min-w-0`}>
 <div>
 <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
 Welcome back, <span className="capitalize text-blue-600 truncate">{userName}</span>
 <span className="text-xl shrink-0" role="img" aria-label="Waving hand">👋</span>
 </h1>
 <p className="text-xs sm:text-sm text-slate-500 mt-1">
 Here is your live double-entry financial summary.
 </p>
 </div>

 <div className="flex items-center gap-2 shrink-0">
 <span className="text-xs font-bold text-slate-600 bg-slate-100/80 px-3.5 py-2 rounded-xl border border-slate-200">
 {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
 </span>
 </div>
 </div>

 <div className="space-y-6 min-w-0">
 
 {/* BENTO TOP ROW: 4 KEY METRIC CARDS */}
 <div className={`grid grid-cols-1 ${forceMobileView ? '' : forceDesktopView ? 'grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-4'} gap-4 min-w-0`}>
 
 {/* REVENUE CARD */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 rounded-2xl relative overflow-hidden group hover:border-blue-300 hover:shadow-2xl transition-all min-w-0">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0 border border-blue-100 shadow-xs">
 <Wallet className="w-5 h-5" />
 </div>
 <button 
 className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500" 
 title="View revenue details"
 aria-label="View revenue details"
 >
 <ArrowUpRight className="w-4 h-4" />
 </button>
 </div>

 <div className="mt-4 min-w-0">
 <span className="text-xs font-semibold text-slate-500 block truncate">Total Revenue (Invoiced)</span>
 <div className="flex items-baseline gap-2 mt-1 min-w-0">
 <span className="text-xl sm:text-2xl font-black text-slate-900 truncate">
 {totalRevenue.toLocaleString()} {primaryCurrency}
 </span>
 <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5 shrink-0" aria-label="Positive trend">
 <TrendingUp className="w-3.5 h-3.5" />
 </span>
 </div>
 </div>
 <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1 truncate">
 <span>Outstanding AR: <span className="font-bold text-amber-600">{pendingReceivables.toLocaleString()} {primaryCurrency}</span></span>
 </p>
 </div>

 {/* EXPENSES CARD */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 rounded-2xl relative overflow-hidden group hover:border-emerald-300 hover:shadow-2xl transition-all min-w-0">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0 border border-emerald-100 shadow-xs">
 <CheckCircle className="w-5 h-5" />
 </div>
 <button 
 className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" 
 title="View expense details"
 aria-label="View expense details"
 >
 <ArrowUpRight className="w-4 h-4" />
 </button>
 </div>

 <div className="mt-4 min-w-0">
 <span className="text-xs font-semibold text-slate-500 block truncate">Total Expenses (Billed)</span>
 <div className="flex items-baseline gap-2 mt-1 min-w-0">
 <span className="text-xl sm:text-2xl font-black text-slate-900 truncate">
 {totalExpenses.toLocaleString()} {primaryCurrency}
 </span>
 </div>
 </div>
 <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1 truncate">
 <span>Outstanding AP: <span className="font-bold text-rose-600">{pendingPayables.toLocaleString()} {primaryCurrency}</span></span>
 </p>
 </div>

 {/* NET POSITION CARD */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-300 hover:shadow-2xl transition-all min-w-0">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0 border border-purple-100 shadow-xs">
 <Clock className="w-5 h-5" />
 </div>
 <button 
 className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-purple-500" 
 title="View net position details"
 aria-label="View net position details"
 >
 <ArrowUpRight className="w-4 h-4" />
 </button>
 </div>

 <div className="mt-4 min-w-0">
 <span className="text-xs font-semibold text-slate-500 block truncate">Net Position</span>
 <div className="flex items-baseline gap-2 mt-1 min-w-0">
 <span className={`text-xl sm:text-2xl font-black truncate ${(totalRevenue - totalExpenses) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
 {(totalRevenue - totalExpenses).toLocaleString()} {primaryCurrency}
 </span>
 </div>
 </div>
 <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1 truncate">
 <span>Invoiced minus Billed</span>
 </p>
 </div>

 {/* TOTAL LIQUID CASH BENTO STAT CARD */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 rounded-2xl relative overflow-hidden group hover:border-indigo-300 hover:shadow-2xl transition-all min-w-0">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0 border border-indigo-100 shadow-xs">
 <Wallet className="w-5 h-5" />
 </div>
 <button 
 className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500" 
 title="View Cashbook"
 aria-label="View Cashbook"
 >
 <ArrowUpRight className="w-4 h-4" />
 </button>
 </div>

 <div className="mt-4 min-w-0">
 <span className="text-xs font-semibold text-slate-500 block truncate">Total Liquid Cash</span>
 <div className="flex items-baseline gap-2 mt-1 min-w-0">
 <span className="text-xl sm:text-2xl font-black text-emerald-600 truncate">
 {totalLiquidCash !== null ? totalLiquidCash.toLocaleString() : '...'} {primaryCurrency}
 </span>
 </div>
 </div>
 <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1 truncate">
 <span>Aggregated Cash & Bank Accounts</span>
 </p>
 </div>

 </div>

 {/* BENTO MIDDLE ROW: CHARTS */}
 <div className={`grid grid-cols-1 ${forceMobileView ? '' : forceDesktopView ? 'grid-cols-2' : 'lg:grid-cols-2'} gap-4 min-w-0`}>
 
 {/* CASH FLOW TIMELINE */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 sm:p-6 rounded-2xl space-y-4 min-w-0">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
 <BarChart2 className="w-4 h-4 text-purple-600 shrink-0" />
 Cash Flow Timeline
 </h3>
 <p className="text-xs text-slate-500 mt-0.5">Track daily/weekly revenue vs expenses</p>
 </div>
 </div>

 <div className="h-56 w-full min-w-0">
 <ResponsiveContainer width="100%" height="100%">
 <AreaChart data={trendData}>
 <defs>
 <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
 <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
 </linearGradient>
 <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3}/>
 <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
 </linearGradient>
 </defs>
 <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} tickLine={false} />
 <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => val.toLocaleString()} />
 <Tooltip 
 contentStyle={{ 
 backgroundColor: 'rgba(255, 255, 255, 0.95)', 
 borderColor: 'rgba(226, 232, 240, 0.9)',
 borderRadius: '12px',
 color: '#0f172a',
 fontSize: '12px',
 boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
 }}
 formatter={(value: any) => [`${Number(value).toLocaleString()} ${primaryCurrency}`, '']}
 />
 <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorSpend)" />
 <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#EC4899" strokeWidth={2} strokeDasharray="3 3" fillOpacity={1} fill="url(#colorActive)" />
 </AreaChart>
 </ResponsiveContainer>
 </div>
 </div>

 {/* RECENT ACTIVITY */}
 <div className="bg-white/85 backdrop-blur-3xl shadow-xl border border-white/60 p-5 sm:p-6 rounded-2xl space-y-4 min-w-0">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
 Recent Activity
 </h3>
 <p className="text-xs text-slate-500 mt-0.5">Latest invoices and bills</p>
 </div>
 </div>
 <div className="space-y-3 min-w-0">
 {invoices.slice(0, 3).map(inv => (
 <div key={inv.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50/70 min-w-0 gap-2 hover:bg-slate-100/60 transition-colors">
 <div className="min-w-0">
 <p className="text-xs font-bold text-slate-900 truncate">Invoice to {inv.customers?.name || 'Customer'}</p>
 <p className="text-[10px] text-slate-500">{inv.issue_date}</p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-xs font-bold text-emerald-600">+{inv.total_amount.toLocaleString()} {primaryCurrency}</p>
 <p className="text-[10px] font-bold text-slate-500 uppercase">{inv.status}</p>
 </div>
 </div>
 ))}
 {bills.slice(0, 3).map(b => (
 <div key={b.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50/70 min-w-0 gap-2 hover:bg-slate-100/60 transition-colors">
 <div className="min-w-0">
 <p className="text-xs font-bold text-slate-900 truncate">Bill from {b.suppliers?.name || 'Supplier'}</p>
 <p className="text-[10px] text-slate-500">{b.issue_date}</p>
 </div>
 <div className="text-right shrink-0">
 <p className="text-xs font-bold text-rose-600">-{b.total_amount.toLocaleString()} {primaryCurrency}</p>
 <p className="text-[10px] font-bold text-slate-500 uppercase">{b.status}</p>
 </div>
 </div>
 ))}
 {invoices.length === 0 && bills.length === 0 && (
 <p className="text-xs text-slate-400 text-center py-6">No recent activity.</p>
 )}
 </div>
 </div>
 
 </div>
 </div>
 </div>
 );
}
