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
    <div className="bg-white/70 backdrop-blur-md border border-white/50 shadow-sm rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col space-y-6 min-w-0">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 truncate">
          <Clock className="w-5 h-5 text-blue-600 shrink-0" />
          A/R & A/P Aging Summary
        </h2>
        <p className="text-sm text-gray-500 mt-1 truncate">Outstanding balances grouped by due date.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-w-0">
        {/* AR Panel */}
        <div className="border border-green-100 bg-green-50/50 rounded-2xl p-4 min-w-0">
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <div className="p-2 bg-green-100 text-green-700 rounded-lg shrink-0">
              <ArrowDownRight className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-gray-800 text-sm truncate">Accounts Receivable (Owed to You)</h3>
          </div>
          <div className="space-y-3 text-sm min-w-0">
            <div className="flex justify-between items-center text-gray-600 gap-2 min-w-0">
              <span className="truncate">Current</span>
              <span className="font-medium shrink-0">{formatMoney(arBuckets.current)}</span>
            </div>
            <div className="flex justify-between items-center text-amber-600 gap-2 min-w-0">
              <span className="truncate">1-30 Days Overdue</span>
              <span className="font-medium shrink-0">{formatMoney(arBuckets.days1To30)}</span>
            </div>
            <div className="flex justify-between items-center text-orange-600 gap-2 min-w-0">
              <span className="truncate">31-60 Days Overdue</span>
              <span className="font-medium shrink-0">{formatMoney(arBuckets.days31To60)}</span>
            </div>
            <div className="flex justify-between items-center text-red-600 font-bold gap-2 min-w-0">
              <span className="flex items-center gap-1 truncate"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/> 60+ Days</span>
              <span className="shrink-0">{formatMoney(arBuckets.daysOver60)}</span>
            </div>
            <div className="pt-3 border-t border-green-200 flex justify-between items-center font-bold text-gray-900 text-base gap-2 min-w-0">
              <span className="truncate">Total A/R</span>
              <span className="shrink-0">{formatMoney(arBuckets.total)}</span>
            </div>
          </div>
        </div>

        {/* AP Panel */}
        <div className="border border-red-100 bg-red-50/30 rounded-2xl p-4 min-w-0">
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <div className="p-2 bg-red-100 text-red-700 rounded-lg shrink-0">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-gray-800 text-sm truncate">Accounts Payable (You Owe)</h3>
          </div>
          <div className="space-y-3 text-sm min-w-0">
            <div className="flex justify-between items-center text-gray-600 gap-2 min-w-0">
              <span className="truncate">Current</span>
              <span className="font-medium shrink-0">{formatMoney(apBuckets.current)}</span>
            </div>
            <div className="flex justify-between items-center text-amber-600 gap-2 min-w-0">
              <span className="truncate">1-30 Days Overdue</span>
              <span className="font-medium shrink-0">{formatMoney(apBuckets.days1To30)}</span>
            </div>
            <div className="flex justify-between items-center text-orange-600 gap-2 min-w-0">
              <span className="truncate">31-60 Days Overdue</span>
              <span className="font-medium shrink-0">{formatMoney(apBuckets.days31To60)}</span>
            </div>
            <div className="flex justify-between items-center text-red-600 font-bold gap-2 min-w-0">
              <span className="flex items-center gap-1 truncate"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/> 60+ Days</span>
              <span className="shrink-0">{formatMoney(apBuckets.daysOver60)}</span>
            </div>
            <div className="pt-3 border-t border-red-200 flex justify-between items-center font-bold text-gray-900 text-base gap-2 min-w-0">
              <span className="truncate">Total A/P</span>
              <span className="shrink-0">{formatMoney(apBuckets.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
