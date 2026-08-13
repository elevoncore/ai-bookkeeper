'use client';

import { useState, useEffect } from 'react';
import { Building2, Coins, Landmark, RefreshCw } from 'lucide-react';

interface CashAccount {
  id: string | null;
  name: string;
  type: string;
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
  const mainBank = data?.accounts.find(a => a.name === 'Main Bank Account') || { balance: 0 };
  const pettyCash = data?.accounts.find(a => a.name === 'Petty Cash') || { balance: 0 };
  const totalCash = data?.totalCashBalance ?? 0;

  return (
    <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 p-6 rounded-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              Cash & Bank Balances
            </h3>
            <p className="text-xs text-gray-500">Real-time liquid cashbook position</p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100/50 transition-all cursor-pointer"
          title="Refresh Cashbook"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          <div className="h-20 bg-gray-100/60 animate-pulse rounded-xl" />
          <div className="h-20 bg-gray-100/60 animate-pulse rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Main Bank Account Card */}
            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-600">Main Bank Account</span>
                  <p className="text-lg font-black text-gray-900 mt-0.5">
                    {mainBank.balance.toLocaleString()} <span className="text-xs font-bold text-gray-500">{primaryCurrency}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Petty Cash Card */}
            <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-gray-600">Petty Cash</span>
                  <p className="text-lg font-black text-gray-900 mt-0.5">
                    {pettyCash.balance.toLocaleString()} <span className="text-xs font-bold text-gray-500">{primaryCurrency}</span>
                  </p>
                </div>
              </div>
            </div>

          </div>

          <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-gray-900 text-white shadow-sm">
            <span className="text-xs font-medium text-gray-300">Total Liquid Cash Available</span>
            <span className="text-sm font-black text-emerald-400">
              {totalCash.toLocaleString()} {primaryCurrency}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
