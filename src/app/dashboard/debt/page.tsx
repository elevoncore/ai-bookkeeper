'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { 
  ArrowLeft, 
  Landmark, 
  Receipt, 
  Coins, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Plus, 
  Layers 
} from 'lucide-react';
import toast from 'react-hot-toast';
import CreatableSelect from '@/components/ui/CreatableSelect';
import { createJournalEntryAtomic, JournalLineItem } from '@/utils/journalEntry';

interface AccountRow {
  id: string;
  name: string;
  code: string;
  type: string;
  is_system: boolean;
  is_cash_account: boolean;
  balance: number;
  interestPaid?: number;
  parent_id?: string | null;
}

function DebtContent() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [isLoading, setIsLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [interestExpense, setInterestExpense] = useState(0);

  // Modal States
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isRepayOpen, setIsRepayOpen] = useState(false);

  // Receive Loan Form State
  const [recAmount, setRecAmount] = useState('');
  const [recBankId, setRecBankId] = useState('');
  const [recLoanId, setRecLoanId] = useState('');
  const [recDesc, setRecDesc] = useState('Loan Inflow');
  const [isRecSubmitting, setIsRecSubmitting] = useState(false);

  // Repay Loan Form State
  const [repayTotal, setRepayTotal] = useState('');
  const [repayInterest, setRepayInterest] = useState('');
  const [repayBankId, setRepayBankId] = useState('');
  const [repayLoanId, setRepayLoanId] = useState('');
  const [repayDesc, setRepayDesc] = useState('Loan Repayment & Interest Service');
  const [isRepaySubmitting, setIsRepaySubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email || '');

      try {
        await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });
      } catch (e) {}

      // Fetch accounts
      const { data: accData } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id);

      // Fetch journal lines
      const accIds = (accData || []).map(a => a.id);
      let linesMap: Record<string, { debit: number; credit: number }> = {};
      accIds.forEach(id => {
        linesMap[id] = { debit: 0, credit: 0 };
      });

      if (accIds.length > 0) {
        const { data: lines } = await supabase
          .from('journal_lines')
          .select('account_id, debit, credit')
          .in('account_id', accIds);

        if (lines) {
          lines.forEach(l => {
            if (linesMap[l.account_id]) {
              linesMap[l.account_id].debit += Number(l.debit || 0);
              linesMap[l.account_id].credit += Number(l.credit || 0);
            }
          });
        }
      }

      // Fetch all LOAN_REPAYMENT lines to calculate interest paid per account
      const { data: allRepayLines } = await supabase
        .from('journal_lines')
        .select('debit, credit, account_id, journal_entry_id, journal_entries(reference_type)')
        .eq('journal_entries.reference_type', 'LOAN_REPAYMENT');

      const interestPaidMap: Record<string, number> = {};
      if (allRepayLines && accData) {
        const interestAccIds = new Set(
          accData.filter(a => a.type === 'expense' && a.name.toLowerCase().includes('interest')).map(a => a.id)
        );
        const loanAccIds = new Set(
          accData.filter(a => a.type === 'liability' && (a.name.toLowerCase().includes('loan') || a.code?.startsWith('25'))).map(a => a.id)
        );

        const entriesMap: Record<string, any[]> = {};
        allRepayLines.forEach(line => {
          if (!entriesMap[line.journal_entry_id]) {
            entriesMap[line.journal_entry_id] = [];
          }
          entriesMap[line.journal_entry_id].push(line);
        });

        Object.values(entriesMap).forEach(lines => {
          const loanLines = lines.filter(l => loanAccIds.has(l.account_id));
          const interestLine = lines.find(l => interestAccIds.has(l.account_id));
          if (interestLine && Number(interestLine.debit) > 0 && loanLines.length > 0) {
            const interestAmt = Number(interestLine.debit);
            loanLines.forEach(ll => {
              interestPaidMap[ll.account_id] = (interestPaidMap[ll.account_id] || 0) + (interestAmt / loanLines.length);
            });
          }
        });
      }

      // Format accounts with balance and interestPaid
      const formatted = (accData || []).map(a => {
        const totals = linesMap[a.id] || { debit: 0, credit: 0 };
        const isDebitNormal = a.type === 'asset' || a.type === 'expense';
        const bal = isDebitNormal ? (totals.debit - totals.credit) : (totals.credit - totals.debit);
        return {
          id: a.id,
          name: a.name,
          code: a.code || '',
          type: a.type,
          is_system: !!a.is_system,
          is_cash_account: !!a.is_cash_account,
          balance: bal,
          interestPaid: interestPaidMap[a.id] || 0,
          parent_id: a.parent_id
        };
      });

      setAccounts(formatted);

      // Fetch global Interest Expense
      const totalInterest = Object.values(interestPaidMap).reduce((sum, val) => sum + val, 0);
      setInterestExpense(totalInterest);

    } catch (e) {
      console.error(e);
      toast.error("Failed to load debt and loan records.");
    } finally {
      setIsLoading(false);
    }
  }

    // Helper properties
  const stParent = accounts.find(a => a.type === 'liability' && a.name === 'Loan Payable');
  const ltParent = accounts.find(a => a.type === 'liability' && a.name === 'Long-Term Loan Payable');

  const loanAccounts = accounts.filter(a => 
    a.type === 'liability' && 
    !a.is_system && 
    (a.parent_id === stParent?.id || a.parent_id === ltParent?.id || a.name.toLowerCase().includes('loan') || a.code?.startsWith('25'))
  );

  const shortTermLoans = accounts.filter(a => 
    a.type === 'liability' && 
    !a.is_system && 
    (a.parent_id === stParent?.id || (!a.parent_id && !a.name.toLowerCase().includes('long-term')))
  );

  const longTermLoans = accounts.filter(a => 
    a.type === 'liability' && 
    !a.is_system && 
    (a.parent_id === ltParent?.id || (!a.parent_id && a.name.toLowerCase().includes('long-term')))
  );

  const cashAccounts = accounts.filter(a => a.is_cash_account === true);

  const totalPrincipalOutstanding = loanAccounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);

  // Handle new loan account creation inline
  async function handleCreateLoanAccount(name: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const isShortTerm = window.confirm(`Is "${name}" a Short-Term loan (< 12 months)?\n\nClick "OK" for Short-Term, or "Cancel" for Long-Term.`);
      const timeHorizon = isShortTerm ? 'short' : 'long';
      
      const parentName = isShortTerm ? 'Loan Payable' : 'Long-Term Loan Payable';
      
      // Find or create parent account ID
      let parentId;
      const { data: parentAcc } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', parentName)
        .eq('type', 'liability')
        .limit(1);

      if (parentAcc && parentAcc.length > 0) {
        parentId = parentAcc[0].id;
      } else {
        const { data: newParent } = await supabase
          .from('accounts')
          .insert({
            user_id: user.id,
            name: parentName,
            type: 'liability',
            is_system: true
          })
          .select('id')
          .single();
        parentId = newParent?.id;
      }

      const { data, error } = await supabase
        .from('accounts')
        .insert({
          user_id: user.id,
          name,
          type: 'liability',
          is_system: false,
          is_cash_account: false,
          parent_id: parentId
        })
        .select('*')
        .single();

      if (error) {
        toast.error(`Failed to create loan account: ${error.message}`);
        return null;
      }

      toast.success(`Loan Account "${name}" created successfully!`);
      const newAcc = {
        id: data.id,
        name: data.name,
        code: data.code || '',
        type: data.type,
        is_system: !!data.is_system,
        is_cash_account: !!data.is_cash_account,
        balance: 0,
        parent_id: data.parent_id,
        interestPaid: 0
      };
      setAccounts(prev => [...prev, newAcc]);
      return newAcc;
    } catch (e) {
      toast.error("Error creating custom loan account.");
      return null;
    }
  }

  // Inflow handler
  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recAmount || !recBankId || !recLoanId) {
      return toast.error("Please fill in all fields.");
    }
    const amt = parseFloat(recAmount);
    if (isNaN(amt) || amt <= 0) return toast.error("Please enter a valid positive amount.");

    setIsRecSubmitting(true);
    const toastId = toast.loading("Processing loan proceeds inflow...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const selectedLoan = loanAccounts.find(la => la.id === recLoanId);
      if (!selectedLoan) throw new Error("Selected loan account not found.");

      const isLongTerm = selectedLoan.parent_id === ltParent?.id || selectedLoan.name.toLowerCase().includes('long-term');
      const timeHorizon = isLongTerm ? 'long' : 'short';

      const { error } = await supabase.rpc('receive_loan_atomic', {
        p_user_id: user.id,
        p_lender_name: selectedLoan.name,
        p_time_horizon: timeHorizon,
        p_bank_account_id: recBankId,
        p_amount: amt,
        p_date: new Date().toISOString().split('T')[0],
        p_description: recDesc
      });

      if (error) throw error;

      toast.success(`Successfully received Loan of ${amt.toLocaleString()} PKR!`, { id: toastId });
      setIsReceiveOpen(false);
      setRecAmount('');
      setRecDesc('Loan Inflow');
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to process loan receipt", { id: toastId });
    } finally {
      setIsRecSubmitting(false);
    }
  }

  // Repayment handler
  async function handleRepaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!repayTotal || !repayBankId || !repayLoanId) {
      return toast.error("Please select loan and bank accounts.");
    }
    const totalVal = parseFloat(repayTotal);
    const interestVal = parseFloat(repayInterest) || 0;
    if (isNaN(totalVal) || totalVal <= 0) return toast.error("Please enter a valid repayment total.");

    setIsRepaySubmitting(true);
    const toastId = toast.loading("Recording loan payment split...");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.rpc('repay_loan_atomic', {
        p_user_id: user.id,
        p_lender_account_id: repayLoanId,
        p_bank_account_id: repayBankId,
        p_total_payment: totalVal,
        p_interest_amount: interestVal,
        p_date: new Date().toISOString().split('T')[0],
        p_description: repayDesc
      });

      if (error) throw error;

      toast.success("Loan repayment recorded successfully!", { id: toastId });
      setIsRepayOpen(false);
      setRepayTotal('');
      setRepayInterest('');
      setRepayDesc('Loan Repayment & Interest Service');
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to record loan payment", { id: toastId });
    } finally {
      setIsRepaySubmitting(false);
    }
  }

  const initials = userEmail ? userEmail.substring(0, 2).toUpperCase() : 'AI';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-2xl border-b border-slate-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="h-5 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="font-heading font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">
              Inscribe<span className="text-blue-600">AI</span>
            </span>
            <span className="text-xs font-bold text-slate-400">/</span>
            <span className="text-xs sm:text-sm font-bold text-slate-600">Debt & Loans Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            {initials}
          </div>
          <span className="text-xs font-semibold text-slate-700 hidden md:inline-block truncate max-w-[180px]">
            {userEmail}
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* KPI Panel */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <Landmark className="w-7 h-7 text-blue-600" />
              Debt & Loans Management
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Track outstanding corporate principal liabilities and amortized interest expense service.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (cashAccounts.length > 0) setRecBankId(cashAccounts[0].id);
                setIsReceiveOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> + Receive Loan
            </button>
            <button
              onClick={() => {
                if (cashAccounts.length > 0) setRepayBankId(cashAccounts[0].id);
                setIsRepayOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Receipt className="w-4 h-4" /> Record Repayment
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs text-slate-500 uppercase font-black tracking-wider block">Total Outstanding Principal</span>
              <p className="text-2xl font-black text-slate-900 mt-1.5">
                {totalPrincipalOutstanding.toLocaleString()} <span className="text-xs font-bold opacity-60">PKR</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center justify-between shadow-xs">
            <div>
              <span className="text-xs text-slate-500 uppercase font-black tracking-wider block">Total Interest Expense Paid</span>
              <p className="text-2xl font-black text-slate-900 mt-1.5">
                {interestExpense.toLocaleString()} <span className="text-xs font-bold opacity-60">PKR</span>
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>
        </div>

                {/* Short-Term Debt Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm">Short-Term Debt (&lt; 12 Months)</h3>
          </div>
          {isLoading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <th className="px-6 py-3">Lender Name</th>
                    <th className="px-6 py-3">Outstanding Principal</th>
                    <th className="px-6 py-3 text-right">Total Interest Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {shortTermLoans.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                        No active short-term loans.
                      </td>
                    </tr>
                  ) : (
                    shortTermLoans.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-slate-900">{a.name}</td>
                        <td className="px-6 py-3.5 font-black text-rose-700">
                          {Math.max(0, a.balance).toLocaleString()} PKR
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-amber-700">
                          {(a.interestPaid || 0).toLocaleString()} PKR
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Long-Term Debt Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm">Long-Term Debt (&gt; 12 Months)</h3>
          </div>
          {isLoading ? (
            <div className="p-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100/50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-100">
                    <th className="px-6 py-3">Lender Name</th>
                    <th className="px-6 py-3">Outstanding Principal</th>
                    <th className="px-6 py-3 text-right">Total Interest Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {longTermLoans.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                        No active long-term loans.
                      </td>
                    </tr>
                  ) : (
                    longTermLoans.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-slate-900">{a.name}</td>
                        <td className="px-6 py-3.5 font-black text-rose-700">
                          {Math.max(0, a.balance).toLocaleString()} PKR
                        </td>
                        <td className="px-6 py-3.5 text-right font-black text-amber-700">
                          {(a.interestPaid || 0).toLocaleString()} PKR
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>


      </div>

      {/* Receive Loan Modal */}
      {isReceiveOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-600" /> Receive Loan Proceeds
              </h3>
              <button onClick={() => setIsReceiveOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleReceiveSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lender (Loan Account) *</label>
                <CreatableSelect
                  options={loanAccounts}
                  value={recLoanId}
                  onChange={setRecLoanId}
                  onCreateNew={handleCreateLoanAccount}
                  placeholder="Select or type to create loan account..."
                  entityType="account"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Deposit Destination *</label>
                <CreatableSelect
                  options={loanAccounts}
                  value={repayLoanId}
                  onChange={setRepayLoanId}
                  onCreateNew={handleCreateLoanAccount}
                  placeholder="Select lender..."
                  entityType="account"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inflow Amount (PKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={recAmount}
                  onChange={e => setRecAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Memo / Description</label>
                <input
                  type="text"
                  value={recDesc}
                  onChange={e => setRecDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsReceiveOpen(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={isRecSubmitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50">
                  {isRecSubmitting ? "Posting..." : "Receive Loan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Repayment Modal */}
      {isRepayOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" /> Record Loan Repayment
              </h3>
              <button onClick={() => setIsRepayOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleRepaySubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lender (Loan Account) *</label>
                <select
                  value={repayLoanId}
                  onChange={e => setRepayLoanId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px] bg-slate-50 focus:outline-none"
                  required
                >
                  <option value="">-- Select Lender --</option>
                  {loanAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({Math.max(0, a.balance).toLocaleString()} PKR due)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Source (Cash/Bank) *</label>
                <select
                  value={repayBankId}
                  onChange={e => setRepayBankId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px] bg-slate-50 focus:outline-none"
                  required
                >
                  <option value="">Select Bank/Cash account...</option>
                  {cashAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Payment Outflow (PKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={repayTotal}
                    onChange={e => setRepayTotal(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Of which is Interest (PKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={repayInterest}
                    onChange={e => setRepayInterest(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px]"
                  />
                </div>
              </div>

              {repayTotal && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold flex justify-between">
                  <span>Principal reduction:</span>
                  <span className="text-rose-600">{(parseFloat(repayTotal) - (parseFloat(repayInterest) || 0)).toLocaleString()} PKR</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Memo / Description</label>
                <input
                  type="text"
                  value={repayDesc}
                  onChange={e => setRepayDesc(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-950 min-h-[44px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setIsRepayOpen(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer">Cancel</button>
                <button type="submit" disabled={isRepaySubmitting} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50">
                  {isRepaySubmitting ? "Posting..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DebtHubPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Loading Debt & Loans Hub...
        </div>
      </div>
    }>
      <DebtContent />
    </Suspense>
  );
}
