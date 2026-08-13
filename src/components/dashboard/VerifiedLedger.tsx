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
    <div className="bg-white/70 backdrop-blur-md border border-white/50 shadow-sm rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="font-semibold text-gray-800">Verified Ledger</h2>
          <p className="text-sm text-gray-500">Your approved and committed records.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-emerald-800">AR:</span>
              <span className="text-sm font-bold text-emerald-700">{totalRevenue.toLocaleString()}</span>
            </div>
            <div className="w-px h-4 bg-gray-300"></div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-rose-800">AP:</span>
              <span className="text-sm font-bold text-rose-700">{totalExpenses.toLocaleString()}</span>
            </div>
          </div>
          <button
            onClick={exportToCSV}
            disabled={transactions.length === 0}
            className="bg-white/70 backdrop-blur-md border border-white/50 shadow-sm hover:bg-gray-50 text-gray-700 border border-gray-300 px-3 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm"
            title="Export to CSV"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No verified transactions yet. Approve some from the pending tab!
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">{t.issue_date}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.contacts?.name || 'Unknown Contact'}</td>
                  <td className="px-4 py-3">
                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs font-medium">
                      {t.chart_of_accounts?.name || 'Unknown Account'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${t.entry_type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {t.entry_type === 'credit' ? 'Invoice/AR' : 'Bill/AP'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${t.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : t.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 text-right">
                    {t.amount.toLocaleString()}
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

