'use client';

import { useState, useEffect } from 'react';
import { Building2, Coins, Landmark, RefreshCw, Wallet, ShieldCheck, Plus, BookOpen, ArrowLeftRight } from 'lucide-react';
import { fetchWithCache, invalidateCache } from '@/lib/cache';

interface CashAccount {
 id: string | null;
 name: string;
 type: string;
 is_cash_account?: boolean;
 balance: number;
 debit_total: number;
 credit_total: number;
}

interface CashbookData {
 mainBankBalance: number;
 pettyCashBalance: number;
 totalCashBalance: number;
 currency: string;
 accounts: CashAccount[];
}

interface CashbookWidgetProps {
 onOpenAddAccount?: () => void;
 onOpenAdjustBalance?: () => void;
 onOpenTransferCash?: () => void;
}

export default function CashbookWidget({ onOpenAddAccount, onOpenAdjustBalance, onOpenTransferCash }: CashbookWidgetProps) {
 const [data, setData] = useState<CashbookData | null>(null);
 const [isLoading, setIsLoading] = useState(true);
 const [isRefreshing, setIsRefreshing] = useState(false);

 async function fetchCashbookData(forceRefresh = false) {
 try {
 if (forceRefresh) {
 invalidateCache('/api/reports/cashbook');
 }
 const json = await fetchWithCache<CashbookData>('/api/reports/cashbook', undefined, 30000);
 if (json) {
 setData(json);
 }
 } catch (e) {
 console.error("Failed to fetch cashbook balances:", e);
 } finally {
 setIsLoading(false);
 setIsRefreshing(false);
 }
 }

 useEffect(() => {
 fetchCashbookData();
 }, []);

 function handleRefresh() {
 setIsRefreshing(true);
 fetchCashbookData(true);
 }

 const primaryCurrency = data?.currency || 'PKR';
 const accounts = data?.accounts || [];
 const totalCash = data?.totalCashBalance ?? 0;

 const iconBadges = [
 { iconBg: 'bg-blue-600 shadow-blue-600/20', icon: Building2 },
 { iconBg: 'bg-emerald-600 shadow-emerald-600/20', icon: Coins },
 { iconBg: 'bg-purple-600 shadow-purple-600/20', icon: Wallet },
 { iconBg: 'bg-indigo-600 shadow-indigo-600/20', icon: Landmark },
 { iconBg: 'bg-amber-600 shadow-amber-600/20', icon: Building2 }
 ];

 return (
 <div className="bg-white/80 backdrop-blur-3xl shadow-xl border border-white/60 p-5 sm:p-6 rounded-3xl space-y-4 min-w-0 transition-colors duration-300">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between min-w-0 gap-3">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-blue-600/20">
 <Landmark className="w-5 h-5" />
 </div>
 <div className="min-w-0">
 <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2 truncate">
 Cash & Bank Balances
 </h3>
 <p className="text-xs text-slate-500 truncate">Dynamic Liquid Cashbook Accounts ({accounts.length})</p>
 </div>
 </div>

 {/* HEADER SHORTCUT BUTTONS */}
 <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end shrink-0">
 {onOpenAddAccount && (
 <button
 onClick={onOpenAddAccount}
 className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/90 hover:bg-white text-blue-700 border border-blue-200/80 text-xs font-bold transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-blue-500"
 title="Add Bank or Wallet Account"
 aria-label="Add Bank or Wallet Account"
 >
 <Plus className="w-4 h-4 text-blue-600 " />
 <span className="hidden sm:inline">+ Add Bank/Wallet</span>
 <span className="sm:hidden">+ Bank/Wallet</span>
 </button>
 )}

 {onOpenAdjustBalance && (
 <button
 onClick={onOpenAdjustBalance}
 className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/90 hover:bg-white text-purple-700 border border-purple-200/80 text-xs font-bold transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-purple-500"
 title="Adjust Cash Balances / Record Transfer"
 aria-label="Adjust Cash Balances or Record Transfer"
 >
 <BookOpen className="w-4 h-4 text-purple-600 " />
 <span className="hidden sm:inline">+ Adjust Balances</span>
 <span className="sm:hidden">+ Adjust</span>
 </button>
 )}

 {onOpenTransferCash && (
 <button
 onClick={onOpenTransferCash}
 className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-xl bg-white/90 hover:bg-white text-indigo-700 border border-indigo-200/80 text-xs font-bold transition-all cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-indigo-500"
 title="Transfer Cash between Cash/Bank Accounts"
 aria-label="Transfer Cash between Cash/Bank Accounts"
 >
 <ArrowLeftRight className="w-4 h-4 text-indigo-600 " />
 <span className="hidden sm:inline">+ Transfer Cash</span>
 <span className="sm:hidden">+ Transfer</span>
 </button>
 )}

 <button
 onClick={handleRefresh}
 disabled={isRefreshing}
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/90 hover:bg-white text-slate-500 hover:text-slate-900 border border-slate-200 transition-all cursor-pointer shrink-0 shadow-xs focus-visible:ring-2 focus-visible:ring-blue-500"
 title="Refresh Cashbook"
 aria-label="Refresh Cashbook"
 >
 <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600 ' : ''}`} />
 </button>
 </div>
 </div>

 {isLoading ? (
 <div className="flex flex-wrap gap-4 py-2">
 <div className="flex-1 min-w-[220px] h-20 bg-slate-100 animate-pulse rounded-2xl" />
 <div className="flex-1 min-w-[220px] h-20 bg-slate-100 animate-pulse rounded-2xl" />
 <div className="flex-1 min-w-[220px] h-20 bg-slate-100 animate-pulse rounded-2xl" />
 </div>
 ) : (
 <div className="space-y-4 min-w-0">
 
 {/* FLUID, AUTO-DISTRIBUTING FLEX LAYOUT */}
 <div className="flex flex-wrap gap-4 min-w-0">
 {accounts.length === 0 ? (
 <p className="text-xs text-slate-400 w-full py-4 text-center">No cash or bank accounts found.</p>
 ) : (
 accounts.map((acc, index) => {
 const style = iconBadges[index % iconBadges.length];
 const IconComponent = style.icon;
 return (
 <div 
 key={acc.id || index} 
 className="flex-1 min-w-[220px] sm:min-w-[240px] p-4 rounded-2xl bg-white/80 backdrop-blur-md border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex items-center justify-between min-w-0 gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className={`w-9 h-9 rounded-xl ${style.iconBg} text-white flex items-center justify-center font-bold shrink-0 shadow-sm`}>
 <IconComponent className="w-4 h-4" />
 </div>
 <div className="min-w-0">
 <span className="text-xs font-bold text-slate-700 block truncate">{acc.name}</span>
 <p className="text-base sm:text-lg font-black text-slate-900 mt-0.5 truncate">
 {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-slate-500 ">{primaryCurrency}</span>
 </p>
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* TOTAL LIQUID CASH SUMMARY BANNER */}
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-5 py-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-md min-w-0 gap-2 sm:gap-4">
 <span className="text-xs font-bold text-slate-300 truncate uppercase tracking-wider flex items-center gap-2">
 <ShieldCheck className="w-4 h-4 text-emerald-400" /> Total Liquid Cash Available
 </span>
 <span className="text-base sm:text-lg font-black text-emerald-400 truncate">
 {totalCash.toLocaleString(undefined, { minimumFractionDigits: 2 })} {primaryCurrency}
 </span>
 </div>

 </div>
 )}
 </div>
 );
}
