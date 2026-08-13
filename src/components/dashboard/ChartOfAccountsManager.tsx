'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  Plus, 
  Search, 
  CheckCircle2, 
  Layers, 
  FolderTree, 
  X, 
  Loader2, 
  Building2, 
  Coins, 
  ShieldCheck, 
  UserCheck 
} from 'lucide-react';
import { parseToCents } from '@/utils/currency';

interface AccountRow {
  id: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_system: boolean;
  balance: number;
  total_debit: number;
  total_credit: number;
}

export default function ChartOfAccountsManager() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'>('asset');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

    // Ensure system accounts seeded
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    // Fetch accounts
    const { data: accData, error: accError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (accError) {
      console.error("Error fetching accounts:", accError);
      setIsLoading(false);
      return;
    }

    const accIds = (accData || []).map(a => a.id);

    // Fetch journal lines to aggregate real-time balances
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

    // Calculate standard accounting balances:
    // Assets & Expenses increase with Debits (Balance = Debit - Credit)
    // Liabilities, Equity & Revenue increase with Credits (Balance = Credit - Debit)
    const formatted: AccountRow[] = (accData || []).map(a => {
      const totals = linesMap[a.id] || { debitCents: 0, creditCents: 0 };
      const isDebitNormal = a.type === 'asset' || a.type === 'expense';
      
      const netCents = isDebitNormal
        ? (totals.debitCents - totals.creditCents)
        : (totals.creditCents - totals.debitCents);

      return {
        id: a.id,
        name: a.name,
        type: a.type,
        is_system: Boolean(a.is_system),
        balance: netCents / 100,
        total_debit: totals.debitCents / 100,
        total_credit: totals.creditCents / 100
      };
    });

    setAccounts(formatted);
    setIsLoading(false);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!newAccountName.trim()) {
      setFormError("Account name is required.");
      return;
    }

    setIsSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFormError("User session not found.");
      setIsSubmitting(false);
      return;
    }

    // Check duplicate
    const existing = accounts.find(a => a.name.trim().toLowerCase() === newAccountName.trim().toLowerCase());
    if (existing) {
      setFormError(`An account named "${newAccountName.trim()}" already exists.`);
      setIsSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: newAccountName.trim(),
      type: newAccountType,
      is_system: false
    });

    if (insertError) {
      console.error("Failed to insert account:", insertError);
      setFormError(insertError.message);
      setIsSubmitting(false);
      return;
    }

    // Success reset
    setNewAccountName('');
    setNewAccountType('asset');
    setIsModalOpen(false);
    setIsSubmitting(false);

    // Refresh state instantly
    await fetchAccountsWithBalances();
  }

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = selectedTypeFilter === 'all' || a.type === selectedTypeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [accounts, searchTerm, selectedTypeFilter]);

  // Group accounts by type for pristine visual presentation
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

    return types.map(t => ({
      type: t,
      label: t.charAt(0).toUpperCase() + t.slice(1) + 's',
      items: groupMap[t]
    }));
  }, [filteredAccounts]);

  const typeBadges: Record<string, string> = {
    asset: 'bg-blue-50 text-blue-700 border-blue-200',
    liability: 'bg-red-50 text-red-700 border-red-200',
    equity: 'bg-purple-50 text-purple-700 border-purple-200',
    revenue: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    expense: 'bg-amber-50 text-amber-700 border-amber-200'
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <FolderTree className="w-6 h-6 text-blue-600" />
            Chart of Accounts
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Master general ledger account catalog & double-entry real-time balances.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" /> + New Account
        </button>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search account name..."
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

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white/40 text-gray-500 text-xs uppercase font-semibold border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3">Account Name</th>
                        <th className="px-6 py-3 w-32">Type</th>
                        <th className="px-6 py-3 w-36">System Account</th>
                        <th className="px-6 py-3 text-right w-44">Current Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-700">
                      {group.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-6 text-center text-xs text-gray-400">
                            No {group.type} accounts found matching filter.
                          </td>
                        </tr>
                      ) : (
                        group.items.map(acc => (
                          <tr key={acc.id} className="hover:bg-white/60 transition-colors">
                            <td className="px-6 py-3.5 font-bold text-gray-900 text-xs">
                              {acc.name}
                            </td>
                            <td className="px-6 py-3.5 text-xs">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${typeBadges[acc.type]}`}>
                                {acc.type}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-xs">
                              {acc.is_system ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                  <ShieldCheck className="w-3 h-3" /> Yes (System)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                                  <UserCheck className="w-3 h-3" /> Custom (User)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-right font-black text-xs text-gray-900">
                              {acc.balance.toLocaleString()} <span className="text-[10px] font-bold text-gray-500">PKR</span>
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
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md p-6 space-y-5 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-600" /> Create Custom Account
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Add a new account to your Chart of Accounts ledger.
              </p>
            </div>

            {formError && (
              <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  required
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Company Car, Office Equipment"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Account Type
                </label>
                <select
                  value={newAccountType}
                  onChange={(e) => setNewAccountType(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-blue-600 outline-none bg-white cursor-pointer"
                >
                  <option value="asset">Asset (e.g. Vehicles, Equipment, Cash)</option>
                  <option value="liability">Liability (e.g. Loans, Credit Cards)</option>
                  <option value="equity">Equity (e.g. Capital Investment)</option>
                  <option value="revenue">Revenue (e.g. Sales, Consulting Income)</option>
                  <option value="expense">Expense (e.g. Fuel, Advertising)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 shadow-md shadow-blue-600/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
