'use client';

import { useState, useEffect } from 'react';
import { Building2, Coins, Landmark, RefreshCw, Wallet, ShieldCheck } from 'lucide-react';

interface CashAccount {
  id: string | null;
  name: string;
  type: string;
  is_cash_account?: boolean;
  balance: number;
  debit_total: number;
  credit_total: number;
}

interface CashbookData {
  mainBankBalance: number;
  pettyCashBalance: number;
  totalCashBalance: number;
  currency: string;
  accounts: CashAccount[];
}

export default function CashbookWidget() {
  const [data, setData] = useState<CashbookData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function fetchCashbookData() {
    try {
      const res = await fetch('/api/reports/cashbook');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch cashbook balances:", e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    fetchCashbookData();
  }, []);

  function handleRefresh() {
    setIsRefreshing(true);
    fetchCashbookData();
  }

  const primaryCurrency = data?.currency || 'PKR';
  const accounts = data?.accounts || [];
  const totalCash = data?.totalCashBalance ?? 0;

  const cardStyles = [
    { bg: 'bg-blue-50/50', border: 'border-blue-100', iconBg: 'bg-blue-600', icon: Building2 },
    { bg: 'bg-emerald-50/50', border: 'border-emerald-100', iconBg: 'bg-emerald-600', icon: Coins },
    { bg: 'bg-purple-50/50', border: 'border-purple-100', iconBg: 'bg-purple-600', icon: Wallet },
    { bg: 'bg-indigo-50/50', border: 'border-indigo-100', iconBg: 'bg-indigo-600', icon: Landmark },
    { bg: 'bg-amber-50/50', border: 'border-amber-100', iconBg: 'bg-amber-600', icon: Building2 }
  ];

  return (
    <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl space-y-4 min-w-0">
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-blue-600/20">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2 truncate">
              Cash & Bank Balances
            </h3>
            <p className="text-xs text-gray-500 truncate">Dynamic Liquid Cashbook Accounts ({accounts.length})</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/70 hover:bg-white text-gray-500 hover:text-gray-900 border border-gray-200 transition-all cursor-pointer shrink-0 shadow-xs"
          title="Refresh Cashbook"
          aria-label="Refresh Cashbook"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-2">
          <div className="h-20 bg-gray-100/60 animate-pulse rounded-xl" />
          <div className="h-20 bg-gray-100/60 animate-pulse rounded-xl" />
          <div className="h-20 bg-gray-100/60 animate-pulse rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          
          {/* DYNAMIC CASH & BANK ACCOUNTS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
            {accounts.length === 0 ? (
              <p className="text-xs text-gray-400 col-span-full py-4 text-center">No cash or bank accounts found.</p>
            ) : (
              accounts.map((acc, index) => {
                const style = cardStyles[index % cardStyles.length];
                const IconComponent = style.icon;
                return (
                  <div key={acc.id || index} className={`p-4 rounded-xl border ${style.border} ${style.bg} flex items-center justify-between min-w-0 gap-3 shadow-2xs`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl ${style.iconBg} text-white flex items-center justify-center font-bold shrink-0 shadow-xs`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-gray-700 block truncate">{acc.name}</span>
                        <p className="text-base sm:text-lg font-black text-gray-900 mt-0.5 truncate">
                          {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-gray-500">{primaryCurrency}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* TOTAL LIQUID CASH SUMMARY BANNER */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-5 py-3.5 rounded-xl bg-gray-900 text-white shadow-md min-w-0 gap-2 sm:gap-4">
            <span className="text-xs font-bold text-gray-300 truncate uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Total Liquid Cash Available
            </span>
            <span className="text-base sm:text-lg font-black text-emerald-400 truncate">
              {totalCash.toLocaleString(undefined, { minimumFractionDigits: 2 })} {primaryCurrency}
            </span>
          </div>

        </div>
      )}
    </div>
  );
}
