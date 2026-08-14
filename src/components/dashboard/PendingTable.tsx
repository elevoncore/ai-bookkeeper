'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, Trash2, Edit2, X, Receipt, FileText } from 'lucide-react';

export type PendingItem = {
  id: string;
  type: 'invoice' | 'bill';
  entityName: string;
  amount: number;
  date: string;
  status: string;
  receiptUrl?: string;
};

interface PendingTableProps {
  items: PendingItem[];
  onDataChanged: () => void;
  onViewLog?: (id: string) => void;
}

export default function PendingTable({ items, onDataChanged, onViewLog }: PendingTableProps) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleVerify(id: string, type: 'invoice' | 'bill') {
    const table = type === 'invoice' ? 'invoices' : 'bills';
    const { error } = await supabase.from(table).update({ is_ai_verified: true }).eq('id', id);
    if (error) console.error("Verify error:", error);
    onDataChanged();
  }

  async function handleDelete(id: string, type: 'invoice' | 'bill') {
    if (!window.confirm("Are you sure you want to delete this draft?")) return;
    const table = type === 'invoice' ? 'invoices' : 'bills';

    // Fetch receipt_url first to clean up storage
    const { data: record } = await supabase.from(table).select('receipt_url').eq('id', id).single();
    if (record?.receipt_url) {
      const fileName = record.receipt_url.split('/receipts/')[1];
      if (fileName) await supabase.storage.from('receipts').remove([fileName]);
    }

    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) console.error("Delete error:", error);
    onDataChanged();
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-white/30 backdrop-blur-3xl shadow-2xl border border-white/50 rounded-2xl shadow-xs border border-amber-200 overflow-hidden mb-6 min-w-0">
      <div className="p-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between min-w-0">
        <h2 className="font-bold text-amber-900 flex items-center gap-2 text-sm sm:text-base truncate">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
          Pending AI Verifications ({items.length})
        </h2>
        <span className="text-xs text-amber-700 font-medium bg-amber-100 px-2.5 py-1 rounded-md shrink-0">Action Required</span>
      </div>
      
      <div className="overflow-x-auto custom-scrollbar min-w-0">
        <table className="w-full text-left text-sm text-gray-600 whitespace-nowrap min-w-[650px]">
          <thead className="bg-white/70 backdrop-blur-md border border-white/50 shadow-sm text-gray-400 text-xs uppercase border-b border-gray-100">
            <tr>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Date</th>
              <th className="px-6 py-3 font-semibold">Entity</th>
              <th className="px-6 py-3 font-semibold text-right">Amount</th>
              <th className="px-6 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {items.map((t) => (
              <tr key={t.id} className="hover:bg-amber-50 transition-colors">
                <td className="px-6 py-3.5">
                  {t.type === 'invoice' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                      <FileText className="w-3.5 h-3.5" /> Invoice
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                      <Receipt className="w-3.5 h-3.5" /> Bill
                    </span>
                  )}
                  {t.receiptUrl && (
                    <a href={t.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex ml-2 items-center text-xs text-blue-600 hover:underline">
                      View Receipt
                    </a>
                  )}
                  {onViewLog && (
                    <button onClick={() => onViewLog(t.id)} className="inline-flex ml-2 items-center text-xs text-gray-500 hover:text-gray-900 underline min-h-[44px] cursor-pointer">
                      Audit Log
                    </button>
                  )}
                </td>
                <td className="px-6 py-3.5 text-gray-500">{t.date}</td>
                <td className="px-6 py-3.5 font-semibold text-gray-900 truncate" title={t.entityName}>{t.entityName}</td>
                <td className="px-6 py-3.5 font-bold text-gray-900 text-right">{t.amount.toLocaleString()} PKR</td>
                <td className="px-6 py-3.5 text-right">
                  <div className="flex justify-end gap-2 items-center">
                    <button 
                      onClick={() => handleVerify(t.id, t.type)} 
                      className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      aria-label="Verify transaction"
                    >
                      <Check className="w-4 h-4" /> Verify
                    </button>
                    <button 
                      onClick={() => handleDelete(t.id, t.type)} 
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      aria-label="Delete transaction draft"
                      title="Delete draft"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
