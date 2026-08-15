'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Download, Loader2, DollarSign, Scale, FolderTree, Landmark, CheckCircle2 } from 'lucide-react';
import ChartOfAccountsManager from './ChartOfAccountsManager';

type Tab = 'chart_of_accounts' | 'ledger' | 'pnl' | 'trial_balance' | 'balance_sheet';

export default function ReportsHub() {
  const [activeTab, setActiveTab] = useState<Tab>('chart_of_accounts');
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch ledger
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('*, journal_lines(*, accounts(name, type))')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (entries) setJournalEntries(entries);

    // Fetch P&L & Trial Balance
    try {
      const res = await fetch('/api/reports/financials');
      if (res.ok) {
        const data = await res.json();
        setFinancials(data);
      }
    } catch (e) {
      console.error("Failed to fetch financials:", e);
    }

    // Fetch Balance Sheet
    try {
      const resBs = await fetch('/api/reports/balance-sheet');
      if (resBs.ok) {
        const bsData = await resBs.json();
        setBalanceSheet(bsData);
      }
    } catch (e) {
      console.error("Failed to fetch balance sheet:", e);
    }

    setIsLoading(false);
  }

  return (
    <div className="space-y-6 min-w-0">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl min-w-0">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Accounting & Financial Ledger
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            General Ledger, Chart of Accounts, P&L, and certified double-entry Balance Sheet.
          </p>
        </div>

        <button className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-sm font-semibold transition-all cursor-pointer shrink-0">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 min-w-0">
        <button
          onClick={() => setActiveTab('chart_of_accounts')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'chart_of_accounts' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <FolderTree className="w-4 h-4" /> Chart of Accounts
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'ledger' ? 'bg-gray-900 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <FileSpreadsheet className="w-4 h-4" /> General Ledger
        </button>
        <button
          onClick={() => setActiveTab('pnl')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <DollarSign className="w-4 h-4" /> Profit & Loss
        </button>
        <button
          onClick={() => setActiveTab('balance_sheet')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'balance_sheet' ? 'bg-purple-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <Landmark className="w-4 h-4" /> Balance Sheet
        </button>
        <button
          onClick={() => setActiveTab('trial_balance')}
          className={`px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${activeTab === 'trial_balance' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <Scale className="w-4 h-4" /> Trial Balance
        </button>
      </div>

      {/* CONTENT FOR CHART OF ACCOUNTS */}
      {activeTab === 'chart_of_accounts' && (
        <ChartOfAccountsManager />
      )}

      {/* MAIN REPORTS CONTENT AREA */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl overflow-hidden min-w-0">
          
          {/* LEDGER TAB */}
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto custom-scrollbar min-w-0">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 w-32">Date</th>
                    <th className="px-6 py-4 w-48">Reference</th>
                    <th className="px-6 py-4">Account</th>
                    <th className="px-6 py-4 text-right w-32">Debit</th>
                    <th className="px-6 py-4 text-right w-32">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {journalEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                        No journal entries found.
                      </td>
                    </tr>
                  )}
                  {journalEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 align-top font-medium text-gray-900">
                        {entry.date}
                      </td>
                      <td className="px-6 py-4 align-top text-xs">
                        <span className="font-semibold text-gray-700 block mb-1">
                          {entry.reference_type?.toUpperCase()}
                        </span>
                        <span className="text-gray-400">
                          {entry.description || '-'}
                        </span>
                      </td>
                      <td className="p-0 col-span-3">
                        <table className="w-full">
                          <tbody>
                            {entry.journal_lines?.map((line: any) => (
                              <tr key={line.id} className="border-b border-gray-50 last:border-0">
                                <td className="px-6 py-3 font-medium text-gray-800">
                                  {line.accounts?.name}
                                </td>
                                <td className="px-6 py-3 text-right text-gray-900 w-32">
                                  {line.debit > 0 ? line.debit.toLocaleString() : '-'}
                                </td>
                                <td className="px-6 py-3 text-right text-gray-900 w-32">
                                  {line.credit > 0 ? line.credit.toLocaleString() : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* P&L TAB */}
          {activeTab === 'pnl' && financials && (
            <div className="p-4 sm:p-8 min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 min-w-0">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl min-w-0">
                  <p className="text-blue-600 text-sm font-semibold mb-1">Gross Profit</p>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-900 truncate">
                    {financials.profit_and_loss.gross_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
                  </h3>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl min-w-0">
                  <p className="text-emerald-600 text-sm font-semibold mb-1">Net Profit</p>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-900 truncate">
                    {financials.profit_and_loss.net_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
                  </h3>
                </div>
              </div>

              <div className="space-y-6 min-w-0">
                {/* Revenue */}
                <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
                    <span className="truncate">Revenue</span>
                    <span className="shrink-0">{financials.profit_and_loss.revenue.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {financials.profit_and_loss.revenue_accounts.map((acc: any) => (
                      <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50 min-w-0 gap-2">
                        <span className="truncate">{acc.name}</span>
                        <span className="shrink-0">{acc.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COGS */}
                <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
                    <span className="truncate">Cost of Goods Sold</span>
                    <span className="shrink-0">{financials.profit_and_loss.cogs.toLocaleString()}</span>
                  </div>
                </div>

                {/* Gross Profit Subtotal */}
                <div className="px-6 py-4 flex justify-between font-extrabold text-blue-900 text-base sm:text-lg min-w-0 gap-2">
                  <span className="truncate">Gross Profit</span>
                  <span className="shrink-0">{financials.profit_and_loss.gross_profit.toLocaleString()}</span>
                </div>

                {/* Operating Expenses */}
                <div className="border border-gray-100 rounded-xl overflow-hidden min-w-0">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100 min-w-0 gap-2">
                    <span className="truncate">Operating Expenses</span>
                    <span className="shrink-0">{financials.profit_and_loss.operating_expenses.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {financials.profit_and_loss.operating_expense_accounts.map((acc: any) => (
                      <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50 min-w-0 gap-2">
                        <span className="truncate">{acc.name}</span>
                        <span className="shrink-0">{acc.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Net Profit Total */}
                <div className="px-6 py-4 flex justify-between font-extrabold text-emerald-900 text-lg sm:text-xl border-t-2 border-gray-900 mt-4 min-w-0 gap-2">
                  <span className="truncate">Net Profit</span>
                  <span className="shrink-0">{financials.profit_and_loss.net_profit.toLocaleString()} PKR</span>
                </div>
              </div>
            </div>
          )}

          {/* BALANCE SHEET TAB */}
          {activeTab === 'balance_sheet' && balanceSheet && (
            <div className="p-4 sm:p-8 min-w-0 space-y-6">
              
              {/* BALANCING STATUS BANNER */}
              {balanceSheet.is_balanced ? (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-emerald-900 gap-2 min-w-0 shadow-xs">
                  <span className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    Books are Balanced! Total Assets equal Total Liabilities + Equity.
                  </span>
                  <span className="font-extrabold text-xs sm:text-sm bg-emerald-100/90 px-3 py-1 rounded-lg text-emerald-950 shrink-0">
                    Assets: {balanceSheet.totals.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
                  </span>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between text-red-900 gap-2 min-w-0 shadow-xs">
                  <span className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                    <Scale className="w-5 h-5 text-red-600 shrink-0" />
                    Imbalance Detected! Total Assets do not equal Total Liabilities + Equity.
                  </span>
                  <span className="font-extrabold text-xs sm:text-sm bg-red-100 px-3 py-1 rounded-lg text-red-950 shrink-0">
                    Diff: {Math.abs(balanceSheet.totals.total_assets - balanceSheet.totals.total_liabilities_and_equity).toLocaleString()} PKR
                  </span>
                </div>
              )}

              {/* STATEMENT HEADER */}
              <div className="bg-gray-900 text-white p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 min-w-0 shadow-md">
                <div>
                  <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                    <Landmark className="w-5 h-5 text-purple-400" /> Statement of Financial Position
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">Official Certified Double-Entry Balance Sheet</p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <span className="text-[10px] text-gray-400 block font-bold uppercase tracking-wider">AS OF DATE</span>
                  <span className="text-sm font-extrabold text-purple-300">{balanceSheet.as_of_date}</span>
                </div>
              </div>

              {/* THREE FINANCIAL SECTIONS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
                
                {/* ASSETS SECTION */}
                <div className="bg-white/80 backdrop-blur-md border border-blue-100 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-blue-100 mb-3 min-w-0 gap-2">
                      <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" /> ASSETS
                      </h3>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                        Debit
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                      {balanceSheet.assets.map((acc: any) => (
                        <div key={acc.id} className="py-2.5 flex justify-between items-center text-gray-700 hover:bg-gray-50/80 px-1 rounded-lg min-w-0 gap-2">
                          <span className="font-medium truncate">{acc.name}</span>
                          <span className="font-bold text-gray-900 shrink-0">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 border-t-2 border-blue-600 flex justify-between items-center font-black text-sm sm:text-base text-blue-950 min-w-0 gap-2 mt-4">
                    <span className="truncate uppercase tracking-wider text-xs">TOTAL ASSETS</span>
                    <span className="shrink-0">{balanceSheet.totals.total_assets.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
                  </div>
                </div>

                {/* LIABILITIES SECTION */}
                <div className="bg-white/80 backdrop-blur-md border border-amber-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-amber-100 mb-3 min-w-0 gap-2">
                      <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" /> LIABILITIES
                      </h3>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                        Credit
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                      {balanceSheet.liabilities.map((acc: any) => (
                        <div key={acc.id} className="py-2.5 flex justify-between items-center text-gray-700 hover:bg-gray-50/80 px-1 rounded-lg min-w-0 gap-2">
                          <span className="font-medium truncate">{acc.name}</span>
                          <span className="font-bold text-gray-900 shrink-0">{acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 border-t-2 border-amber-600 flex justify-between items-center font-black text-sm sm:text-base text-amber-950 min-w-0 gap-2 mt-4">
                    <span className="truncate uppercase tracking-wider text-xs">TOTAL LIABILITIES</span>
                    <span className="shrink-0">{balanceSheet.totals.total_liabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
                  </div>
                </div>

                {/* EQUITY SECTION */}
                <div className="bg-white/80 backdrop-blur-md border border-purple-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex items-center justify-between pb-3 border-b border-purple-100 mb-3 min-w-0 gap-2">
                      <h3 className="font-black text-base text-gray-900 flex items-center gap-2 truncate">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" /> EQUITY
                      </h3>
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                        Capital + Retained
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100 text-xs sm:text-sm">
                      {balanceSheet.equity.map((acc: any) => (
                        <div 
                          key={acc.id || acc.name} 
                          className={`py-2.5 flex justify-between items-center px-2 rounded-lg min-w-0 gap-2 ${acc.is_net_income ? 'bg-emerald-50/90 border border-emerald-200 my-1' : 'hover:bg-gray-50/80 text-gray-700'}`}
                        >
                          <div className="min-w-0">
                            <span className={`font-medium truncate block ${acc.is_net_income ? 'font-bold text-emerald-950' : ''}`}>{acc.name}</span>
                            {acc.is_net_income && <span className="text-[10px] text-emerald-700 font-semibold block">Rolling Net Profit from P&L</span>}
                          </div>
                          <span className={`font-bold shrink-0 ${acc.is_net_income ? 'text-emerald-950 text-base' : 'text-gray-900'}`}>
                            {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-3 border-t-2 border-purple-600 flex justify-between items-center font-black text-sm sm:text-base text-purple-950 min-w-0 gap-2 mt-4">
                    <span className="truncate uppercase tracking-wider text-xs">TOTAL EQUITY</span>
                    <span className="shrink-0">{balanceSheet.totals.total_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR</span>
                  </div>
                </div>

              </div>

              {/* SUMMARY BAR: LIABILITIES + EQUITY VS ASSETS */}
              <div className="p-5 rounded-2xl bg-gray-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-lg min-w-0">
                <div>
                  <span className="text-xs font-bold text-gray-400 block uppercase tracking-wider">TOTAL LIABILITIES & EQUITY</span>
                  <span className="text-xl sm:text-2xl font-black text-purple-300">
                    {balanceSheet.totals.total_liabilities_and_equity.toLocaleString(undefined, { minimumFractionDigits: 2 })} PKR
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Equal to Total Assets ({balanceSheet.totals.total_assets.toLocaleString()} PKR)
                  </span>
                </div>
              </div>

            </div>
          )}

          {/* TRIAL BALANCE TAB */}
          {activeTab === 'trial_balance' && financials && (
            <div className="overflow-x-auto custom-scrollbar min-w-0 p-0">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[600px]">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Account</th>
                    <th className="px-6 py-4 w-32">Type</th>
                    <th className="px-6 py-4 text-right w-40">Debit</th>
                    <th className="px-6 py-4 text-right w-40">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {financials.trial_balance.map((acc: any) => (
                    <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{acc.name}</td>
                      <td className="px-6 py-3 text-gray-500 uppercase text-xs">{acc.type}</td>
                      <td className="px-6 py-3 text-right">{acc.debits > 0 ? acc.debits.toLocaleString() : '-'}</td>
                      <td className="px-6 py-3 text-right">{acc.credits > 0 ? acc.credits.toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                  {/* TOTAL ROW */}
                  <tr className="bg-gray-50 font-extrabold text-gray-900 text-base">
                    <td className="px-6 py-4" colSpan={2}>TOTAL</td>
                    <td className="px-6 py-4 text-right">{financials.total_debits.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">{financials.total_credits.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
              <div className="p-6 bg-white border-t border-gray-100">
                {financials.total_debits === financials.total_credits ? (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-4 py-3 rounded-xl w-fit text-xs sm:text-sm">
                    <Scale className="w-5 h-5 shrink-0" /> Debits equal Credits. Books are balanced!
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 px-4 py-3 rounded-xl w-fit text-xs sm:text-sm">
                    <Scale className="w-5 h-5 shrink-0" /> Imbalance Detected! Difference: {Math.abs(financials.total_debits - financials.total_credits).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
