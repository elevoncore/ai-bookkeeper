'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { FileSpreadsheet, Download, Loader2, DollarSign, Scale, FileText } from 'lucide-react';

type Tab = 'ledger' | 'pnl' | 'trial_balance';

export default function ReportsHub() {
  const [activeTab, setActiveTab] = useState<Tab>('ledger');
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [financials, setFinancials] = useState<any>(null);
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

    // Fetch financials
    try {
      const res = await fetch('/api/reports/financials');
      if (res.ok) {
        const data = await res.json();
        setFinancials(data);
      }
    } catch (e) {
      console.error(e);
    }

    setIsLoading(false);
  }

  return (
    <div className="space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl ">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Financial Reports
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            General Ledger and certified double-entry accounting records.
          </p>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm font-semibold transition-all cursor-pointer">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'ledger' ? 'bg-gray-900 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <FileSpreadsheet className="w-4 h-4" /> General Ledger
        </button>
        <button
          onClick={() => setActiveTab('pnl')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'pnl' ? 'bg-blue-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <DollarSign className="w-4 h-4" /> Profit & Loss
        </button>
        <button
          onClick={() => setActiveTab('trial_balance')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === 'trial_balance' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
        >
          <Scale className="w-4 h-4" /> Trial Balance
        </button>
      </div>

      {/* CONTENT */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl  overflow-hidden">
          
          {/* LEDGER TAB */}
          {activeTab === 'ledger' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
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
                        No journal entries found. Wait for the automated triggers to fire upon invoice/bill creation.
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
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                  <p className="text-blue-600 text-sm font-semibold mb-1">Gross Profit</p>
                  <h3 className="text-3xl font-extrabold text-blue-900">
                    {financials.profit_and_loss.gross_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
                  </h3>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
                  <p className="text-emerald-600 text-sm font-semibold mb-1">Net Profit</p>
                  <h3 className="text-3xl font-extrabold text-emerald-900">
                    {financials.profit_and_loss.net_profit.toLocaleString()} <span className="text-lg font-medium">PKR</span>
                  </h3>
                </div>
              </div>

              <div className="space-y-6">
                {/* Revenue */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100">
                    <span>Revenue</span>
                    <span>{financials.profit_and_loss.revenue.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {financials.profit_and_loss.revenue_accounts.map((acc: any) => (
                      <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50">
                        <span>{acc.name}</span>
                        <span>{acc.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* COGS */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100">
                    <span>Cost of Goods Sold</span>
                    <span>{financials.profit_and_loss.cogs.toLocaleString()}</span>
                  </div>
                </div>

                {/* Gross Profit Subtotal */}
                <div className="px-6 py-4 flex justify-between font-extrabold text-blue-900 text-lg">
                  <span>Gross Profit</span>
                  <span>{financials.profit_and_loss.gross_profit.toLocaleString()}</span>
                </div>

                {/* Operating Expenses */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-6 py-4 flex justify-between font-bold text-gray-900 border-b border-gray-100">
                    <span>Operating Expenses</span>
                    <span>{financials.profit_and_loss.operating_expenses.toLocaleString()}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {financials.profit_and_loss.operating_expense_accounts.map((acc: any) => (
                      <div key={acc.name} className="px-6 py-3 flex justify-between text-sm text-gray-600 hover:bg-gray-50">
                        <span>{acc.name}</span>
                        <span>{acc.balance.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Net Profit Total */}
                <div className="px-6 py-4 flex justify-between font-extrabold text-emerald-900 text-xl border-t-2 border-gray-900 mt-4">
                  <span>Net Profit</span>
                  <span>{financials.profit_and_loss.net_profit.toLocaleString()} PKR</span>
                </div>
              </div>
            </div>
          )}

          {/* TRIAL BALANCE TAB */}
          {activeTab === 'trial_balance' && financials && (
            <div className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
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
                  <div className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-4 py-3 rounded-xl w-fit">
                    <Scale className="w-5 h-5" /> Debits equal Credits. Books are balanced!
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600 font-bold bg-red-50 px-4 py-3 rounded-xl w-fit">
                    <Scale className="w-5 h-5" /> Imbalance Detected! Difference: {Math.abs(financials.total_debits - financials.total_credits).toLocaleString()}
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

