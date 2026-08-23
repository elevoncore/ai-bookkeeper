'use client';

import { useMemo } from 'react';
import { Wallet, Download } from 'lucide-react';

type Transaction = {
  id: string; amount: number; issue_date: string; contact_id: string; account_id: string;
  is_ai_verified: boolean; status: 'paid' | 'unpaid' | 'partial'; entry_type: 'credit' | 'debit';
  description: string;
  contacts?: { name: string, type: string };
  chart_of_accounts?: { name: string, account_type: string };
};

interface VerifiedLedgerProps {
  transactions: Transaction[];
}

export default function VerifiedLedger({ transactions }: VerifiedLedgerProps) {
  const totalRevenue = useMemo(() => {
    return transactions.filter(t => t.entry_type === 'credit').reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const totalExpenses = useMemo(() => {
    return transactions.filter(t => t.entry_type === 'debit').reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  function exportToCSV() {
    if (transactions.length === 0) return;
    const headers = ['Date', 'Contact', 'Account', 'Type', 'Status', 'Amount'];
    const rows = transactions.map(t => [
      t.issue_date || '',
      `"${(t.contacts?.name || 'Unknown').replace(/"/g, '""')}"`,
      `"${t.chart_of_accounts?.name || 'Uncategorized'}"`,
      t.entry_type === 'credit' ? 'Invoice/AR' : 'Bill/AP',
      t.status,
      t.amount || 0
    ]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `verified-ledger-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="bg-white/80 dark:bg-slate-900/70 backdrop-blur-3xl rounded-2xl shadow-xl dark:shadow-black/40 border border-white/60 dark:border-slate-800 overflow-hidden transition-colors duration-300">
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">Verified Ledger</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Your approved and committed double-entry records.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">AR:</span>
              <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400">{totalRevenue.toLocaleString()} PKR</span>
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-rose-800 dark:text-rose-400">AP:</span>
              <span className="text-xs sm:text-sm font-black text-rose-700 dark:text-rose-400">{totalExpenses.toLocaleString()} PKR</span>
            </div>
          </div>
          
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Export CSV"
            aria-label="Export Verified Ledger to CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]" aria-label="Verified Ledger Transactions">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th scope="col" className="px-6 py-3.5">Date</th>
              <th scope="col" className="px-6 py-3.5">Contact</th>
              <th scope="col" className="px-6 py-3.5">Account</th>
              <th scope="col" className="px-6 py-3.5">Type</th>
              <th scope="col" className="px-6 py-3.5">Status</th>
              <th scope="col" className="px-6 py-3.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/60 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                  <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No verified transactions yet.
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3.5 text-slate-500 dark:text-slate-400">{t.issue_date}</td>
                  <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-white truncate max-w-[200px]" title={t.contacts?.name}>
                    {t.contacts?.name || 'Unknown Contact'}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                      {t.chart_of_accounts?.name || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    {t.entry_type === 'credit' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                        Invoice / AR
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                        Bill / AP
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                      t.status === 'paid' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' :
                      t.status === 'partial' ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300' :
                      'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className={`px-6 py-3.5 text-right font-black ${
                    t.entry_type === 'credit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {t.entry_type === 'credit' ? '+' : '-'}{t.amount.toLocaleString()} PKR
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

