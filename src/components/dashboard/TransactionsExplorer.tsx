'use client';

import { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown,
  Download,
  Calendar
} from 'lucide-react';

interface Transaction {
  id: string; amount: number; issue_date: string; contact_id: string; account_id: string;
  is_ai_verified: boolean; status: 'paid' | 'unpaid' | 'partial'; entry_type: 'credit' | 'debit';
  description: string;
  contacts?: { name: string, type: string };
  chart_of_accounts?: { name: string, account_type: string };
}

interface TransactionsExplorerProps {
  transactions: Transaction[];
}

export default function TransactionsExplorer({ transactions }: TransactionsExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Transaction | 'account' | 'contact'; direction: 'asc' | 'desc' }>({ key: 'issue_date', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Filter & Search Logic
  const filteredData = useMemo(() => {
    return transactions.filter(t => {
      const contactName = t.contacts?.name || '';
      const accountName = t.chart_of_accounts?.name || '';
      const matchesSearch = contactName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            accountName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' 
                            ? true 
                            : statusFilter === 'verified' 
                              ? t.is_ai_verified 
                              : !t.is_ai_verified;
      return matchesSearch && matchesStatus;
    });
  }, [transactions, searchTerm, statusFilter]);

  // Sorting Logic
  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    sortableItems.sort((a, b) => {
      if (sortConfig.key === 'account') {
        const catA = a.chart_of_accounts?.name || '';
        const catB = b.chart_of_accounts?.name || '';
        if (catA < catB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (catA > catB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }
      if (sortConfig.key === 'contact') {
        const conA = a.contacts?.name || '';
        const conB = b.contacts?.name || '';
        if (conA < conB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (conA > conB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      const valA = a[sortConfig.key as keyof Transaction] || '';
      const valB = b[sortConfig.key as keyof Transaction] || '';

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [filteredData, sortConfig]);

  // Pagination Logic
  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function handleSort(key: keyof Transaction | 'account' | 'contact') {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  }

  return (
    <div className="bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      
      {/* Header & Controls */}
      <div className="p-6 border-b border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Data Explorer</h2>
            <p className="text-sm text-gray-500">Search, filter, and export all your ledger entries.</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center pt-2">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search contact or account..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
          </div>

          {/* Status Filter */}
          <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
            <button 
              onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${statusFilter === 'all' ? 'bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              All
            </button>
            <button 
              onClick={() => { setStatusFilter('verified'); setCurrentPage(1); }}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${statusFilter === 'verified' ? 'bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Verified
            </button>
            <button 
              onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
              className={`flex-1 sm:flex-none px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${statusFilter === 'pending' ? 'bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              Pending
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-gray-50/80 text-gray-500 font-medium border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('issue_date')}>
                <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('contact')}>
                <div className="flex items-center gap-1">Contact <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('account')}>
                <div className="flex items-center gap-1">Account <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('entry_type')}>
                <div className="flex items-center gap-1">Type <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="px-6 py-3 cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleSort('amount')}>
                <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="w-3 h-3" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {currentData.length > 0 ? (
              currentData.map(tx => (
                <tr key={tx.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-6 py-3.5 text-gray-500 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {tx.issue_date}
                  </td>
                  <td className="px-6 py-3.5 font-medium text-gray-900">{tx.contacts?.name || 'Unknown Contact'}</td>
                  <td className="px-6 py-3.5">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                      {tx.chart_of_accounts?.name || 'Uncategorized'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${tx.entry_type === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {tx.entry_type === 'credit' ? 'Invoice/AR' : 'Bill/AP'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : tx.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-bold text-gray-900 text-right">
                    {tx.amount.toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No transactions found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length}</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-900">Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
