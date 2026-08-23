import React, { useMemo } from 'react';
import { Clock, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface AgingSummaryPanelProps {
 invoices: any[];
 bills: any[];
}

interface Bucket {
 current: number;
 days1To30: number;
 days31To60: number;
 daysOver60: number;
 total: number;
}

export default function AgingSummaryPanel({ invoices, bills }: AgingSummaryPanelProps) {
 const arBuckets = useMemo(() => calculateBuckets(invoices), [invoices]);
 const apBuckets = useMemo(() => calculateBuckets(bills), [bills]);

 function calculateBuckets(items: any[]): Bucket {
 const bucket = { current: 0, days1To30: 0, days31To60: 0, daysOver60: 0, total: 0 };
 const today = new Date();
 today.setHours(0, 0, 0, 0);

 items.forEach(item => {
 if (item.balance_due > 0 && item.status !== 'draft') {
 const balance = Number(item.balance_due);
 bucket.total += balance;
 
 if (!item.due_date) {
 bucket.current += balance;
 return;
 }

 const dueDate = new Date(item.due_date);
 const diffTime = today.getTime() - dueDate.getTime();
 const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

 if (diffDays <= 0) {
 bucket.current += balance;
 } else if (diffDays <= 30) {
 bucket.days1To30 += balance;
 } else if (diffDays <= 60) {
 bucket.days31To60 += balance;
 } else {
 bucket.daysOver60 += balance;
 }
 }
 });

 return bucket;
 }

 const formatMoney = (val: number) => 
 val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

 return (
 <div className="bg-white/85 backdrop-blur-3xl border border-white/60 shadow-xl rounded-3xl p-5 sm:p-6 flex flex-col space-y-6 min-w-0">
 <div className="min-w-0">
 <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 truncate">
 <Clock className="w-5 h-5 text-blue-600 shrink-0" />
 A/R & A/P Aging Summary
 </h2>
 <p className="text-xs sm:text-sm text-slate-500 mt-1 truncate">Outstanding balances grouped by due date.</p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-w-0">
 {/* AR Panel */}
 <div className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-4 sm:p-5 min-w-0">
 <div className="flex items-center gap-2.5 mb-4 min-w-0">
 <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0">
 <ArrowDownRight className="w-4 h-4" />
 </div>
 <h3 className="font-bold text-slate-900 text-sm truncate">Accounts Receivable (Owed to You)</h3>
 </div>
 <div className="space-y-3 text-xs sm:text-sm min-w-0">
 <div className="flex justify-between items-center text-slate-600 gap-2 min-w-0">
 <span className="truncate">Current</span>
 <span className="font-semibold text-slate-900 shrink-0">{formatMoney(arBuckets.current)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-amber-700 gap-2 min-w-0">
 <span className="truncate">1-30 Days Overdue</span>
 <span className="font-semibold shrink-0">{formatMoney(arBuckets.days1To30)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-orange-700 gap-2 min-w-0">
 <span className="truncate">31-60 Days Overdue</span>
 <span className="font-semibold shrink-0">{formatMoney(arBuckets.days31To60)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-rose-700 font-bold gap-2 min-w-0">
 <span className="flex items-center gap-1 truncate"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/> 60+ Days</span>
 <span className="shrink-0">{formatMoney(arBuckets.daysOver60)} PKR</span>
 </div>
 <div className="pt-3 border-t border-emerald-200 flex justify-between items-center font-black text-slate-900 text-sm sm:text-base gap-2 min-w-0">
 <span className="truncate">Total A/R</span>
 <span className="shrink-0 text-emerald-700">{formatMoney(arBuckets.total)} PKR</span>
 </div>
 </div>
 </div>

 {/* AP Panel */}
 <div className="border border-rose-200 bg-rose-50/60 rounded-2xl p-4 sm:p-5 min-w-0">
 <div className="flex items-center gap-2.5 mb-4 min-w-0">
 <div className="p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0">
 <ArrowUpRight className="w-4 h-4" />
 </div>
 <h3 className="font-bold text-slate-900 text-sm truncate">Accounts Payable (You Owe)</h3>
 </div>
 <div className="space-y-3 text-xs sm:text-sm min-w-0">
 <div className="flex justify-between items-center text-slate-600 gap-2 min-w-0">
 <span className="truncate">Current</span>
 <span className="font-semibold text-slate-900 shrink-0">{formatMoney(apBuckets.current)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-amber-700 gap-2 min-w-0">
 <span className="truncate">1-30 Days Overdue</span>
 <span className="font-semibold shrink-0">{formatMoney(apBuckets.days1To30)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-orange-700 gap-2 min-w-0">
 <span className="truncate">31-60 Days Overdue</span>
 <span className="font-semibold shrink-0">{formatMoney(apBuckets.days31To60)} PKR</span>
 </div>
 <div className="flex justify-between items-center text-rose-700 font-bold gap-2 min-w-0">
 <span className="flex items-center gap-1 truncate"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/> 60+ Days</span>
 <span className="shrink-0">{formatMoney(apBuckets.daysOver60)} PKR</span>
 </div>
 <div className="pt-3 border-t border-rose-200 flex justify-between items-center font-black text-slate-900 text-sm sm:text-base gap-2 min-w-0">
 <span className="truncate">Total A/P</span>
 <span className="shrink-0 text-rose-700">{formatMoney(apBuckets.total)} PKR</span>
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
