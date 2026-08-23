'use client';

import React, { useState, useMemo, useTransition, memo } from 'react';
import { 
 Search, 
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

const ExplorerRow = memo(function ExplorerRow({ tx }: { tx: Transaction }) {
  return (
    <tr className="hover:bg-blue-50/50 transition-colors">
      <td className="px-6 py-3.5 text-slate-500 flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-slate-400" />
        {tx.issue_date}
      </td>
      <td className="px-6 py-3.5 font-bold text-slate-900">{tx.contacts?.name || 'Unknown Contact'}</td>
      <td className="px-6 py-3.5">
        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg border border-slate-200/60">
          {tx.chart_of_accounts?.name || 'Uncategorized'}
        </span>
      </td>
      <td className="px-6 py-3.5">
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${tx.entry_type === 'credit' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {tx.entry_type === 'credit' ? 'Invoice / AR' : 'Bill / AP'}
        </span>
      </td>
      <td className="px-6 py-3.5">
        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${tx.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : tx.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
          {tx.status}
        </span>
      </td>
      <td className="px-6 py-3.5 font-black text-slate-900 text-right">
        {tx.amount.toLocaleString()} PKR
      </td>
    </tr>
  );
});

export default function TransactionsExplorer({ transactions }: TransactionsExplorerProps) {
 const [searchTerm, setSearchTerm] = useState('');
 const [deferredSearch, setDeferredSearch] = useState('');
 const [isPending, startTransition] = useTransition();
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
 <div className="bg-white/80 backdrop-blur-3xl rounded-2xl shadow-xl border border-white/60 overflow-hidden transition-colors duration-300">
 
 {/* Header & Controls */}
 <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
 <div>
 <h2 className="text-base sm:text-lg font-bold text-slate-900 ">Data Explorer</h2>
 <p className="text-xs sm:text-sm text-slate-500 ">Search, filter, and export all your double-entry ledger entries.</p>
 </div>
 <button className="flex items-center gap-2 px-4 py-2 min-h-[44px] bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60 text-xs font-bold rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500">
 <Download className="w-4 h-4" /> Export CSV
 </button>
 </div>

 <div className="flex flex-col sm:flex-row gap-3 items-center pt-2">
 {/* Search */}
 <div className="relative flex-1 w-full">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
 <input 
 type="text" 
 placeholder="Search contact or account..." 
 value={searchTerm}
 onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
 className="w-full pl-9 pr-4 py-2.5 min-h-[44px] text-xs sm:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all font-medium"
 />
 </div>

 {/* Status Filter */}
 <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto border border-slate-200/60 " role="tablist">
 <button 
 role="tab"
 aria-selected={statusFilter === 'all'}
 onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
 className={`flex-1 sm:flex-none px-4 py-1.5 min-h-[36px] text-xs font-bold rounded-lg transition-all cursor-pointer ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 ' : 'text-slate-500 hover:text-slate-900 '}`}
 >
 All
 </button>
 <button 
 role="tab"
 aria-selected={statusFilter === 'verified'}
 onClick={() => { setStatusFilter('verified'); setCurrentPage(1); }}
 className={`flex-1 sm:flex-none px-4 py-1.5 min-h-[36px] text-xs font-bold rounded-lg transition-all cursor-pointer ${statusFilter === 'verified' ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 ' : 'text-slate-500 hover:text-slate-900 '}`}
 >
 Verified
 </button>
 <button 
 role="tab"
 aria-selected={statusFilter === 'pending'}
 onClick={() => { setStatusFilter('pending'); setCurrentPage(1); }}
 className={`flex-1 sm:flex-none px-4 py-1.5 min-h-[36px] text-xs font-bold rounded-lg transition-all cursor-pointer ${statusFilter === 'pending' ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60 ' : 'text-slate-500 hover:text-slate-900 '}`}
 >
 Pending
 </button>
 </div>
 </div>
 </div>

 {/* Table */}
 <div className="overflow-x-auto custom-scrollbar">
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]" aria-label="Transactions Data Table">
 <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200 ">
 <tr>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 " onClick={() => handleSort('issue_date')}>
 <div className="flex items-center gap-1">Date <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 " onClick={() => handleSort('contact')}>
 <div className="flex items-center gap-1">Contact <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 " onClick={() => handleSort('account')}>
 <div className="flex items-center gap-1">Account <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 " onClick={() => handleSort('entry_type')}>
 <div className="flex items-center gap-1">Type <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 " onClick={() => handleSort('status')}>
 <div className="flex items-center gap-1">Status <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 <th scope="col" className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 text-right" onClick={() => handleSort('amount')}>
 <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown className="w-3 h-3" /></div>
 </th>
 </tr>
 </thead>
          <tbody className="divide-y divide-slate-100 bg-white/60 text-slate-700">
            {currentData.length > 0 ? (
              currentData.map(tx => (
                <ExplorerRow key={tx.id} tx={tx} />
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                  No transactions found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
 </table>
 </div>

 {/* Pagination Controls */}
 {totalPages > 1 && (
 <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm text-slate-500 ">
 <span>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length}</span>
 <div className="flex items-center gap-2">
 <button 
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 disabled={currentPage === 1}
 className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500"
 aria-label="Previous Page"
 >
 <ChevronLeft className="w-5 h-5" />
 </button>
 <span className="font-bold text-slate-900 ">Page {currentPage} of {totalPages}</span>
 <button 
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 disabled={currentPage === totalPages}
 className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500"
 aria-label="Next Page"
 >
 <ChevronRight className="w-5 h-5" />
 </button>
 </div>
 </div>
 )}

 </div>
 );
}

