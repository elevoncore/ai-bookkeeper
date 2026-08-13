'use client';

import { useMemo, useState } from 'react';
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
  const [timeRange, setTimeRange] = useState<'Daily' | 'Monthly'>('Monthly');

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
    <div className="space-y-6">
      
      {/* PERSONALIZED GREETING HEADER */}
      <div className={`flex flex-col ${forceMobileView ? '' : forceDesktopView ? 'flex-row' : 'sm:flex-row'} justify-between items-start ${forceMobileView ? '' : forceDesktopView ? 'items-center' : 'sm:items-center'} gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl `}>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Welcome back, <span className="capitalize text-blue-600">{userName}</span>
            <span className="text-xl">👋</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Here is your SME Bookkeeping financial summary.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        
        {/* BENTO TOP ROW: 3 KEY METRIC CARDS */}
        <div className={`grid grid-cols-1 ${forceMobileView ? '' : forceDesktopView ? 'grid-cols-3' : 'md:grid-cols-3'} gap-4`}>
          
          <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-5 rounded-2xl  relative overflow-hidden group hover:border-blue-200 transition-all">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Wallet className="w-5 h-5" />
              </div>
              <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <span className="text-xs font-medium text-gray-500">Total Revenue (Invoiced)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-gray-900">
                  {totalRevenue.toLocaleString()} {primaryCurrency}
                </span>
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
              <span>Outstanding AR: <span className="font-bold text-amber-600">{pendingReceivables.toLocaleString()} {primaryCurrency}</span></span>
            </p>
          </div>

          <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-5 rounded-2xl  relative overflow-hidden group hover:border-emerald-200 transition-all">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle className="w-5 h-5" />
              </div>
              <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <span className="text-xs font-medium text-gray-500">Total Expenses (Billed)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-gray-900">
                  {totalExpenses.toLocaleString()} {primaryCurrency}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
              <span>Outstanding AP: <span className="font-bold text-red-500">{pendingPayables.toLocaleString()} {primaryCurrency}</span></span>
            </p>
          </div>

          <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-5 rounded-2xl  relative overflow-hidden group hover:border-purple-200 transition-all">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <button className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:text-gray-700 flex items-center justify-center cursor-pointer">
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4">
              <span className="text-xs font-medium text-gray-500">Net Position</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={`text-2xl font-black ${(totalRevenue - totalExpenses) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(totalRevenue - totalExpenses).toLocaleString()} {primaryCurrency}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
              <span>Invoiced minus Billed</span>
            </p>
          </div>

        </div>

        {/* BENTO MIDDLE ROW: CHARTS */}
        <div className={`grid grid-cols-1 ${forceMobileView ? '' : forceDesktopView ? 'grid-cols-2' : 'lg:grid-cols-2'} gap-4`}>
          
          <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl  space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-purple-600" />
                  Cash Flow Timeline
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Track daily/weekly revenue vs expenses</p>
              </div>
            </div>

            <div className="h-56 w-full">
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
                  <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} tickLine={false} />
                  <YAxis stroke="#9CA3AF" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorSpend)" />
                  <Area type="monotone" dataKey="expenses" stroke="#EC4899" strokeWidth={2} strokeDasharray="3 3" fillOpacity={1} fill="url(#colorActive)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl  space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  Recent Activity
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Latest invoices and bills</p>
              </div>
            </div>
            <div className="space-y-3">
              {invoices.slice(0, 3).map(inv => (
                <div key={inv.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl bg-gray-50">
                  <div>
                    <p className="text-xs font-bold text-gray-800">Invoice to {inv.customers?.name}</p>
                    <p className="text-[10px] text-gray-500">{inv.issue_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-emerald-600">+{inv.total_amount.toLocaleString()} {primaryCurrency}</p>
                    <p className="text-[10px] font-semibold text-gray-500">{inv.status.toUpperCase()}</p>
                  </div>
                </div>
              ))}
              {bills.slice(0, 3).map(b => (
                <div key={b.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl bg-gray-50">
                  <div>
                    <p className="text-xs font-bold text-gray-800">Bill from {b.suppliers?.name}</p>
                    <p className="text-[10px] text-gray-500">{b.issue_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-red-600">-{b.total_amount.toLocaleString()} {primaryCurrency}</p>
                    <p className="text-[10px] font-semibold text-gray-500">{b.status.toUpperCase()}</p>
                  </div>
                </div>
              ))}
              {invoices.length === 0 && bills.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No recent activity.</p>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

