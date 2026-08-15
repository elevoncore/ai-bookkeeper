'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  BookOpen, 
  Plus, 
  Search, 
  CheckCircle2, 
  FolderTree, 
  X, 
  Loader2, 
  ShieldCheck, 
  UserCheck,
  Trash2,
  Edit2,
  AlertCircle,
  Landmark,
  Building2,
  Coins,
  Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';
import { createJournalEntryAtomic } from '@/utils/journalEntry';
import CashbookWidget from '@/components/dashboard/CashbookWidget';

interface AccountRow {
  id: string;
  name: string;
  code?: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_system: boolean;
  is_cash_account?: boolean;
  balance: number;
  total_debit: number;
  total_credit: number;
}

interface ManualJournalLineInput {
  account_id: string;
  debit: string;
  credit: string;
}

export default function ChartOfAccountsManager() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  
  // New Account Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountType, setNewAccountType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [isCashAccount, setIsCashAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Account Modal State
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editType, setEditType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [editIsCash, setEditIsCash] = useState(false);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Manual Journal Entry Modal State
  const [isJournalModalOpen, setIsJournalModalOpen] = useState(false);
  const [journalDate, setJournalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [journalDescription, setJournalDescription] = useState<string>('');
  const [journalLines, setJournalLines] = useState<ManualJournalLineInput[]>([
    { account_id: '', debit: '', credit: '' },
    { account_id: '', debit: '', credit: '' }
  ]);
  const [isJournalSubmitting, setIsJournalSubmitting] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchAccountsWithBalances();
  }, []);

  async function fetchAccountsWithBalances() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    // Ensure system default accounts exist
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    // Fetch accounts
    const { data: accData, error: accError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (accError) {
      console.error("Error fetching accounts:", accError);
      toast.error(`Failed to fetch accounts: ${accError.message}`);
      setIsLoading(false);
      return;
    }

    const accIds = (accData || []).map(a => a.id);

    // Fetch journal lines to aggregate real-time double-entry balances
    let linesMap: Record<string, { debitCents: number; creditCents: number }> = {};
    accIds.forEach(id => {
      linesMap[id] = { debitCents: 0, creditCents: 0 };
    });

    if (accIds.length > 0) {
      const { data: lines } = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')
        .in('account_id', accIds);

      if (lines) {
        lines.forEach(l => {
          if (linesMap[l.account_id]) {
            linesMap[l.account_id].debitCents += parseToCents(l.debit || 0);
            linesMap[l.account_id].creditCents += parseToCents(l.credit || 0);
          }
        });
      }
    }

    // Format account balances
    const formatted: AccountRow[] = (accData || []).map(a => {
      const totals = linesMap[a.id] || { debitCents: 0, creditCents: 0 };
      const isDebitNormal = a.type === 'asset' || a.type === 'expense';
      
      const netCents = isDebitNormal
        ? (totals.debitCents - totals.creditCents)
        : (totals.creditCents - totals.debitCents);

      const isCash = Boolean(a.is_cash_account) || 
        a.name === 'Main Bank Account' || 
        a.name === 'Petty Cash' || 
        a.name.toLowerCase().includes('bank') || 
        a.name.toLowerCase().includes('cash');

      return {
        id: a.id,
        name: a.name,
        code: a.code || '',
        type: a.type,
        is_system: Boolean(a.is_system),
        is_cash_account: isCash,
        balance: netCents / 100,
        total_debit: totals.debitCents / 100,
        total_credit: totals.creditCents / 100
      };
    });

    setAccounts(formatted);
    setIsLoading(false);
  }

  // --- CREATE ACCOUNT HANDLER ---
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccountName.trim()) {
      return toast.error("Account name is required.");
    }

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("User session not found.");
      setIsSubmitting(false);
      return;
    }

    const existing = accounts.find(a => a.name.trim().toLowerCase() === newAccountName.trim().toLowerCase());
    if (existing) {
      toast.error(`An account named "${newAccountName.trim()}" already exists.`);
      setIsSubmitting(false);
      return;
    }

    // Try inserting account
    let insertData: any = {
      user_id: user.id,
      name: newAccountName.trim(),
      type: newAccountType,
      is_system: false
    };

    if (newAccountCode.trim()) {
      insertData.code = newAccountCode.trim();
    }
    if (newAccountType === 'asset' && isCashAccount) {
      insertData.is_cash_account = true;
    }

    let { error: insertError } = await supabase.from('accounts').insert(insertData);

    // Fallback if optional schema columns (code, is_cash_account) do not exist in DB
    if (insertError && (insertError.message?.includes('code') || insertError.message?.includes('is_cash_account'))) {
      delete insertData.code;
      delete insertData.is_cash_account;
      const res = await supabase.from('accounts').insert(insertData);
      insertError = res.error;
    }

    if (insertError) {
      console.error("Failed to insert account:", insertError);
      toast.error(`Failed to create account: ${insertError.message}`);
      setIsSubmitting(false);
      return;
    }

    toast.success(`Account "${newAccountName.trim()}" created successfully!`);
    setNewAccountName('');
    setNewAccountCode('');
    setNewAccountType('asset');
    setIsCashAccount(false);
    setIsModalOpen(false);
    setIsSubmitting(false);

    await fetchAccountsWithBalances();
  }

  // --- EDIT ACCOUNT HANDLER ---
  function openEditModal(acc: AccountRow) {
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditCode(acc.code || '');
    setEditType(acc.type);
    setEditIsCash(Boolean(acc.is_cash_account));
  }

  async function handleUpdateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    if (!editName.trim()) return toast.error("Account name cannot be empty.");

    setIsEditSubmitting(true);
    let updatePayload: any = {
      name: editName.trim(),
      type: editType
    };

    if (editCode.trim()) {
      updatePayload.code = editCode.trim();
    }
    if (editType === 'asset' && editIsCash) {
      updatePayload.is_cash_account = true;
    }

    let { error: updateErr } = await supabase
      .from('accounts')
      .update(updatePayload)
      .eq('id', editingAccount.id);

    if (updateErr && (updateErr.message?.includes('code') || updateErr.message?.includes('is_cash_account'))) {
      delete updatePayload.code;
      delete updatePayload.is_cash_account;
      const res = await supabase.from('accounts').update(updatePayload).eq('id', editingAccount.id);
      updateErr = res.error;
    }

    if (updateErr) {
      toast.error(`Failed to update account: ${updateErr.message}`);
      setIsEditSubmitting(false);
      return;
    }

    toast.success(`Account updated successfully!`);
    setEditingAccount(null);
    setIsEditSubmitting(false);
    await fetchAccountsWithBalances();
  }

  // --- DELETE ACCOUNT HANDLER WITH SAFETY RULES ---
  async function handleDeleteAccount(acc: AccountRow) {
    // Safety Rule 1: System account check
    if (acc.is_system) {
      toast.error("System protected accounts cannot be deleted to preserve accounting integrity.");
      return;
    }

    // Safety Rule 2: Non-zero balance check
    if (Math.abs(acc.balance) > 0.001) {
      toast.error(`Cannot delete "${acc.name}" because it has a non-zero balance (${acc.balance.toLocaleString()} PKR). Please adjust balance to zero first.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete custom account "${acc.name}"?`)) return;

    const { error: delErr } = await supabase
      .from('accounts')
      .delete()
      .eq('id', acc.id);

    if (delErr) {
      toast.error(`Failed to delete account: ${delErr.message}`);
      return;
    }

    toast.success(`Account "${acc.name}" deleted.`);
    await fetchAccountsWithBalances();
  }

  // --- MANUAL JOURNAL ENTRY HANDLERS ---
  function handleAddJournalLine() {
    setJournalLines(prev => [...prev, { account_id: '', debit: '', credit: '' }]);
  }

  function handleRemoveJournalLine(index: number) {
    if (journalLines.length <= 2) return;
    setJournalLines(prev => prev.filter((_, i) => i !== index));
  }

  function handleJournalLineChange(index: number, field: keyof ManualJournalLineInput, val: string) {
    setJournalLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      if (field === 'debit' && val !== '') {
        return { ...line, debit: val, credit: '' };
      }
      if (field === 'credit' && val !== '') {
        return { ...line, credit: val, debit: '' };
      }
      return { ...line, [field]: val };
    }));
  }

  const totalDebitCents = useMemo(() => {
    return journalLines.reduce((sum, l) => sum + parseToCents(l.debit || 0), 0);
  }, [journalLines]);

  const totalCreditCents = useMemo(() => {
    return journalLines.reduce((sum, l) => sum + parseToCents(l.credit || 0), 0);
  }, [journalLines]);

  const isJournalBalanced = useMemo(() => {
    return totalDebitCents === totalCreditCents && totalDebitCents > 0;
  }, [totalDebitCents, totalCreditCents]);

  async function handlePostJournalEntry(e: React.FormEvent) {
    e.preventDefault();

    if (!journalDescription.trim()) {
      return toast.error("Journal entry description is required.");
    }

    if (!isJournalBalanced) {
      return toast.error("Journal entry is unbalanced. Total Debits must equal Total Credits.");
    }

    if (journalLines.some(l => !l.account_id)) {
      return toast.error("All journal lines must have an account selected.");
    }

    setIsJournalSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("User session not found.");
      setIsJournalSubmitting(false);
      return;
    }

    const formattedLines = journalLines.map(l => ({
      account_id: l.account_id,
      debit: (parseToCents(l.debit || 0)) / 100,
      credit: (parseToCents(l.credit || 0)) / 100
    }));

    const result = await createJournalEntryAtomic(supabase, {
      user_id: user.id,
      date: journalDate,
      description: journalDescription.trim(),
      lines: formattedLines,
      created_by_source: 'MANUAL'
    });

    if (result.error) {
      toast.error(`Journal Entry Failed: ${result.error}`);
      setIsJournalSubmitting(false);
      return;
    }

    toast.success("General Journal Entry posted successfully!");
    setJournalDescription('');
    setJournalLines([
      { account_id: '', debit: '', credit: '' },
      { account_id: '', debit: '', credit: '' }
    ]);
    setIsJournalModalOpen(false);
    setIsJournalSubmitting(false);

    await fetchAccountsWithBalances();
  }

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (a.code && a.code.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesFilter = selectedTypeFilter === 'all' || a.type === selectedTypeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [accounts, searchTerm, selectedTypeFilter]);

  // Group accounts by type with clean plural labels
  const [sortField, setSortField] = useState<'name' | 'type' | 'balance'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  function toggleSort(field: 'name' | 'type' | 'balance') {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  const groupedAccounts = useMemo(() => {
    const types: ('asset' | 'liability' | 'equity' | 'revenue' | 'expense')[] = [
      'asset', 'liability', 'equity', 'revenue', 'expense'
    ];

    const groupMap: Record<string, AccountRow[]> = {
      asset: [],
      liability: [],
      equity: [],
      revenue: [],
      expense: []
    };

    filteredAccounts.forEach(a => {
      if (groupMap[a.type]) {
        groupMap[a.type].push(a);
      }
    });

    const labels: Record<string, string> = {
      asset: 'Assets',
      liability: 'Liabilities',
      equity: 'Equity',
      revenue: 'Revenues',
      expense: 'Expenses'
    };

    return types.map(t => {
      const items = [...groupMap[t]].sort((a, b) => {
        let comp = 0;
        if (sortField === 'name') comp = a.name.localeCompare(b.name);
        else if (sortField === 'type') comp = a.type.localeCompare(b.type);
        else if (sortField === 'balance') comp = (a.balance || 0) - (b.balance || 0);
        return sortOrder === 'asc' ? comp : -comp;
      });

      return {
        type: t,
        label: labels[t] || (t.charAt(0).toUpperCase() + t.slice(1)),
        items
      };
    });
  }, [filteredAccounts, sortField, sortOrder]);

  const typeBadges: Record<string, string> = {
    asset: 'bg-blue-50 text-blue-700 border-blue-200',
    liability: 'bg-red-50 text-red-700 border-red-200',
    equity: 'bg-purple-50 text-purple-700 border-purple-200',
    revenue: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    expense: 'bg-amber-50 text-amber-700 border-amber-200'
  };

  return (
    <div className="space-y-6">
      
      {/* RELOCATED RICH CASHBOOK WIDGET WITH DIRECT SHORTCUTS */}
      <CashbookWidget 
        onOpenAddAccount={() => {
          setNewAccountType('asset');
          setIsCashAccount(true);
          setIsModalOpen(true);
        }}
        onOpenAdjustBalance={() => setIsJournalModalOpen(true)}
      />

      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-blue-600" />
            Chart of Accounts Manager
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Master double-entry account catalog & real-time general ledger balances.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsJournalModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4" /> + New Journal Entry
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> + New Account
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search account name or code..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-white/70 backdrop-blur-md border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {['all', 'asset', 'liability', 'equity', 'revenue', 'expense'].map((typeKey) => (
            <button
              key={typeKey}
              onClick={() => setSelectedTypeFilter(typeKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                selectedTypeFilter === typeKey
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white/60 text-gray-600 hover:bg-white border border-gray-200'
              }`}
            >
              {typeKey === 'all' ? 'All Types' : typeKey}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {groupedAccounts.map(group => {
            if (group.items.length === 0 && selectedTypeFilter !== 'all') return null;

            return (
              <div key={group.type} className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl overflow-hidden">
                <div className="bg-gray-50/80 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-gray-700 tracking-wider flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      group.type === 'asset' ? 'bg-blue-500' :
                      group.type === 'liability' ? 'bg-red-500' :
                      group.type === 'equity' ? 'bg-purple-500' :
                      group.type === 'revenue' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`} />
                    {group.label} ({group.items.length})
                  </span>
                </div>

                <div className="overflow-x-auto custom-scrollbar min-w-0">
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]">
                    <thead className="bg-white/40 text-gray-500 text-xs uppercase font-semibold border-b border-gray-100">
                      <tr>
                        <th onClick={() => toggleSort('name')} className="px-6 py-3 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
                          Account Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => toggleSort('type')} className="px-6 py-3 w-32 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
                          Type {sortField === 'type' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-3 w-36">Bank / Cash</th>
                        <th className="px-6 py-3 w-36">System Protected</th>
                        <th onClick={() => toggleSort('balance')} className="px-6 py-3 text-right w-44 cursor-pointer hover:bg-gray-100/60 transition-colors select-none">
                          Current Balance {sortField === 'balance' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-6 py-3 text-center w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {group.items.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-6 text-center text-xs text-gray-400">
                            No {group.type} accounts found matching filter.
                          </td>
                        </tr>
                      ) : (
                        group.items.map(acc => (
                          <tr key={acc.id} className="hover:bg-white/60 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-900 text-xs">
                              {acc.name}
                              {acc.code && <span className="text-[10px] text-gray-400 ml-2 font-mono">({acc.code})</span>}
                            </td>
                            <td className="px-6 py-3.5 text-xs">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${typeBadges[acc.type]}`}>
                                {acc.type}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-xs">
                              {acc.is_cash_account ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <Landmark className="w-3 h-3" /> Yes (Cash/Bank)
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-xs">
                              {acc.is_system ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                  <ShieldCheck className="w-3 h-3" /> System
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                                  <UserCheck className="w-3 h-3" /> Custom
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black text-xs text-gray-900">
                              {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] font-bold text-gray-500">PKR</span>
                            </td>
                            <td className="px-6 py-3.5 text-center text-xs">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => openEditModal(acc)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="Edit Account"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAccount(acc)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md p-6 space-y-5 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" /> Create Ledger Account
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Add a new account to your Chart of Accounts.
              </p>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Secondary Digital Bank, Office Equipment"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Code (Optional)
                </label>
                <input
                  type="text"
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                  placeholder="e.g. 1020, 5050"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Type *
                </label>
                <select
                  value={newAccountType}
                  onChange={(e) => {
                    const t = e.target.value as any;
                    setNewAccountType(t);
                    if (t !== 'asset') setIsCashAccount(false);
                  }}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none bg-white cursor-pointer"
                >
                  <option value="asset">Asset (e.g. Bank, Cash, Equipment)</option>
                  <option value="liability">Liability (e.g. Credit Card, Loans)</option>
                  <option value="equity">Equity (e.g. Owner Investment)</option>
                  <option value="revenue">Revenue (e.g. Sales, Service Income)</option>
                  <option value="expense">Expense (e.g. Utilities, COGS)</option>
                </select>
              </div>

              {/* DYNAMIC BANK OR CASH ACCOUNT TOGGLE */}
              {newAccountType === 'asset' && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between min-h-[44px]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-blue-600" /> Is this a Bank or Cash account?
                    </span>
                    <p className="text-[11px] text-gray-500">
                      Bank/Cash accounts automatically appear in the liquid Cashbook widget.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isCashAccount}
                    onChange={(e) => setIsCashAccount(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-md shadow-blue-600/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md p-6 space-y-5 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setEditingAccount(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-blue-600" /> Edit Account
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Modify account metadata for "{editingAccount.name}".
              </p>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Code (Optional)
                </label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Type *
                </label>
                <select
                  value={editType}
                  onChange={(e) => {
                    const t = e.target.value as any;
                    setEditType(t);
                    if (t !== 'asset') setEditIsCash(false);
                  }}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none bg-white cursor-pointer"
                >
                  <option value="asset">Asset (e.g. Bank, Cash, Equipment)</option>
                  <option value="liability">Liability (e.g. Credit Card, Loans)</option>
                  <option value="equity">Equity (e.g. Owner Investment)</option>
                  <option value="revenue">Revenue (e.g. Sales, Service Income)</option>
                  <option value="expense">Expense (e.g. Utilities, COGS)</option>
                </select>
              </div>

              {editType === 'asset' && (
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 flex items-center justify-between min-h-[44px]">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-blue-600" /> Is this a Bank or Cash account?
                    </span>
                    <p className="text-[11px] text-gray-500">
                      Bank/Cash accounts appear in the liquid Cashbook widget.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={editIsCash}
                    onChange={(e) => setEditIsCash(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-md shadow-blue-600/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  {isEditSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL JOURNAL ENTRY MODAL */}
      {isJournalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-2xl p-6 space-y-5 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsJournalModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="shrink-0">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-purple-600" /> New General Journal Entry
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Post balanced debit and credit lines directly to the General Ledger.
              </p>
            </div>

            <form onSubmit={handlePostJournalEntry} className="space-y-4 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={journalDate}
                    onChange={(e) => setJournalDate(e.target.value)}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Description / Reference</label>
                  <input
                    type="text"
                    required
                    value={journalDescription}
                    onChange={(e) => setJournalDescription(e.target.value)}
                    placeholder="e.g. Owner capital investment, Bank to Petty Cash transfer"
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              </div>

              {/* DYNAMIC JOURNAL LINES TABLE */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-800 uppercase">Journal Lines</span>
                  <button
                    type="button"
                    onClick={handleAddJournalLine}
                    className="text-xs font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1 cursor-pointer min-h-[44px] px-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Line
                  </button>
                </div>

                <div className="space-y-2">
                  {journalLines.map((line, idx) => (
                    <div key={idx} className="flex gap-2 items-center bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                      <div className="flex-1">
                        <select
                          required
                          value={line.account_id}
                          onChange={(e) => handleJournalLineChange(idx, 'account_id', e.target.value)}
                          className="w-full px-2.5 py-2 min-h-[44px] rounded-lg border border-gray-300 text-xs text-gray-900 outline-none bg-white cursor-pointer"
                        >
                          <option value="">-- Select Account --</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type.toUpperCase()})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Debit PKR"
                          value={line.debit}
                          onChange={(e) => handleJournalLineChange(idx, 'debit', e.target.value)}
                          className="w-full px-2.5 py-2 min-h-[44px] rounded-lg border border-gray-300 text-xs text-gray-900 outline-none text-right font-semibold"
                        />
                      </div>

                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Credit PKR"
                          value={line.credit}
                          onChange={(e) => handleJournalLineChange(idx, 'credit', e.target.value)}
                          className="w-full px-2.5 py-2 min-h-[44px] rounded-lg border border-gray-300 text-xs text-gray-900 outline-none text-right font-semibold"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveJournalLine(idx)}
                        disabled={journalLines.length <= 2}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* LIVE BALANCING SUMMARY */}
              <div className={`p-3 rounded-xl border text-xs flex justify-between items-center ${
                isJournalBalanced 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {isJournalBalanced ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Balanced! Total Debits equal Total Credits.</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Unbalanced Journal Entry (Debits must equal Credits).</span>
                    </>
                  )}
                </div>
                <div className="font-extrabold text-right space-x-3">
                  <span>Debits: {(totalDebitCents / 100).toLocaleString()} PKR</span>
                  <span>Credits: {(totalCreditCents / 100).toLocaleString()} PKR</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsJournalModalOpen(false)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isJournalBalanced || isJournalSubmitting || journalLines.some(l => !l.account_id)}
                  className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 shadow-md shadow-purple-600/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                >
                  {isJournalSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Post Journal Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
