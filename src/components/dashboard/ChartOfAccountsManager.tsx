'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  BookOpen, 
  Plus, 
  Search, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  Loader2, 
  X,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseToCents } from '@/utils/currency';

export default function ChartOfAccountsManager() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: '', code: '', type: 'expense', balance: '0' });

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Ensure defaults exist
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('code', { ascending: true });

    if (error) {
      toast.error(`Failed to fetch accounts: ${error.message}`);
    } else if (data) {
      setAccounts(data);
    }
    setIsLoading(false);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccount.name || !newAccount.code) return toast.error("Name and Code are required");

    const toastId = toast.loading("Creating Ledger Account...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.dismiss(toastId);
      return toast.error("Not authenticated");
    }

    const initialBalanceCents = parseToCents(newAccount.balance || '0');

    const { error } = await supabase.from('accounts').insert({
      user_id: user.id,
      name: newAccount.name,
      code: newAccount.code,
      type: newAccount.type,
      balance: Math.round(initialBalanceCents) / 100
    });

    if (error) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    } else {
      toast.success("Account created in General Ledger!", { id: toastId });
      setIsModalOpen(false);
      setNewAccount({ name: '', code: '', type: 'expense', balance: '0' });
      fetchAccounts();
    }
  }

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          acc.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || acc.type === selectedType;
    return matchesSearch && matchesType;
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'asset':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">ASSET</span>;
      case 'liability':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-red-50 text-red-700 border border-red-200">LIABILITY</span>;
      case 'equity':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200">EQUITY</span>;
      case 'revenue':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">REVENUE</span>;
      case 'expense':
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">EXPENSE</span>;
      default:
        return <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-gray-50 text-gray-700 border border-gray-200">{type.toUpperCase()}</span>;
    }
  };

  return (
    <div className="space-y-6 relative min-w-0">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl min-w-0">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-blue-600 shrink-0" />
            Chart of Accounts Manager
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Core Double-Entry General Ledger Structure & Account Balances.
          </p>
        </div>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 font-bold" />
          Add Account
        </button>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl overflow-hidden min-w-0">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 min-w-0">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by code or name..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 min-h-[44px] bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
            />
          </div>

          <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto w-full sm:w-auto min-w-0">
            {['all', 'asset', 'liability', 'equity', 'revenue', 'expense'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-2 min-h-[44px] rounded-lg transition-all capitalize cursor-pointer whitespace-nowrap ${selectedType === t ? 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-blue-700 font-bold' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* LISTING TABLE */}
        <div className="p-0 overflow-x-auto min-w-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-blue-600">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Account Code</th>
                  <th className="px-6 py-4">Account Name</th>
                  <th className="px-6 py-4 text-center">Type</th>
                  <th className="px-6 py-4 text-center">System Protected</th>
                  <th className="px-6 py-4 text-right">Current Ledger Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-gray-900">
                      {acc.code}
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-800">
                      {acc.name}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getTypeBadge(acc.type)}
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-medium text-gray-500">
                      {acc.is_system ? (
                        <span className="inline-flex items-center gap-1 text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                          <CheckCircle2 className="w-3 h-3" /> System
                        </span>
                      ) : (
                        <span className="text-gray-400">Custom</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-bold font-mono text-gray-900">
                      {(acc.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
                    </td>
                  </tr>
                ))}

                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-gray-500">
                      No matching accounts found in the Chart of Accounts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CREATE NEW ACCOUNT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white/90 backdrop-blur-2xl rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600 shrink-0" />
                Add Ledger Account
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCreateAccount} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Code *</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. 5050"
                    value={newAccount.code}
                    onChange={e => setNewAccount({...newAccount, code: e.target.value})}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono font-medium text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Type *</label>
                  <select 
                    value={newAccount.type}
                    onChange={e => setNewAccount({...newAccount, type: e.target.value})}
                    className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm capitalize"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Software Subscriptions"
                  value={newAccount.name}
                  onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Opening Balance (PKR)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  value={newAccount.balance}
                  onChange={e => setNewAccount({...newAccount, balance: e.target.value})}
                  className="w-full px-3 py-2.5 min-h-[44px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-sm"
                />
              </div>
            </form>

            <div className="p-6 border-t border-gray-100 bg-white flex gap-3 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 min-h-[44px] bg-gray-100 text-gray-700 hover:bg-gray-200 font-semibold rounded-xl transition-colors cursor-pointer">
                Cancel
              </button>
              <button type="submit" onClick={handleCreateAccount} className="flex-1 px-4 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-blue-600/20 cursor-pointer">
                Create Account
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
