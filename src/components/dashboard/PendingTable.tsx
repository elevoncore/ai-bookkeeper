'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Check, Trash2, Edit2, X, Receipt, FileText, Loader2 } from 'lucide-react';

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
 const [processingId, setProcessingId] = useState<string | null>(null);

 const supabase = createBrowserClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
 );

 async function handleVerify(id: string, type: 'invoice' | 'bill') {
 setProcessingId(id);
 const table = type === 'invoice' ? 'invoices' : 'bills';
 const { error } = await supabase.from(table).update({ is_ai_verified: true }).eq('id', id);
 if (error) console.error("Verify error:", error);
 setProcessingId(null);
 onDataChanged();
 }

 async function handleDelete(id: string, type: 'invoice' | 'bill') {
 if (!window.confirm("Are you sure you want to delete this draft?")) return;
 setProcessingId(id);
 const table = type === 'invoice' ? 'invoices' : 'bills';

 // Fetch receipt_url first to clean up storage
 const { data: record } = await supabase.from(table).select('receipt_url').eq('id', id).single();
 if (record?.receipt_url) {
 const fileName = record.receipt_url.split('/receipts/')[1];
 if (fileName) await supabase.storage.from('receipts').remove([fileName]);
 }

 const { error } = await supabase.from(table).delete().eq('id', id);
 if (error) console.error("Delete error:", error);
 setProcessingId(null);
 onDataChanged();
 }

 if (items.length === 0) return null;

 return (
 <section 
 className="bg-white/85 backdrop-blur-3xl shadow-xl rounded-2xl border border-amber-200 overflow-hidden mb-6 min-w-0"
 aria-label="Pending AI Verifications"
 >
 <div className="p-4 border-b border-amber-200/80 bg-amber-50/90 flex items-center justify-between min-w-0">
 <h2 className="font-bold text-amber-950 flex items-center gap-2 text-sm sm:text-base truncate">
 <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" aria-hidden="true" />
 Pending AI Verifications ({items.length})
 </h2>
 <span className="text-xs text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded-lg shrink-0 border border-amber-200">
 Action Required
 </span>
 </div>
 
 <div className="overflow-x-auto custom-scrollbar min-w-0">
 <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]" aria-label="Pending verification transactions">
 <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200">
 <tr>
 <th scope="col" className="px-6 py-3.5">Type</th>
 <th scope="col" className="px-6 py-3.5">Date</th>
 <th scope="col" className="px-6 py-3.5">Entity</th>
 <th scope="col" className="px-6 py-3.5 text-right">Amount</th>
 <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
 {items.map((t) => (
 <tr key={t.id} className="hover:bg-amber-50/40 transition-colors">
 <td className="px-6 py-3.5">
 {t.type === 'invoice' ? (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
 <FileText className="w-3.5 h-3.5" /> Invoice
 </span>
 ) : (
 <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
 <Receipt className="w-3.5 h-3.5" /> Bill
 </span>
 )}
 {t.receiptUrl && (
 <a 
 href={t.receiptUrl} 
 target="_blank" 
 rel="noreferrer" 
 className="inline-flex ml-2 items-center text-xs text-blue-600 hover:underline font-semibold"
 >
 View Receipt
 </a>
 )}
 {onViewLog && (
 <button 
 onClick={() => onViewLog(t.id)} 
 className="inline-flex ml-2 items-center text-xs text-slate-500 hover:text-slate-900 underline min-h-[44px] cursor-pointer"
 >
 Audit Log
 </button>
 )}
 </td>
 <td className="px-6 py-3.5 text-slate-500 font-medium">{t.date}</td>
 <td className="px-6 py-3.5 font-bold text-slate-900 truncate" title={t.entityName}>{t.entityName}</td>
 <td className="px-6 py-3.5 font-black text-slate-900 text-right">{t.amount.toLocaleString()} PKR</td>
 <td className="px-6 py-3.5 text-right">
 <div className="flex justify-end gap-2 items-center">
 <button 
 onClick={() => handleVerify(t.id, t.type)} 
 disabled={processingId === t.id}
 className="flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500"
 aria-label={`Verify transaction for ${t.entityName}`}
 >
 {processingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
 Verify
 </button>
 <button 
 onClick={() => handleDelete(t.id, t.type)} 
 disabled={processingId === t.id}
 className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
 aria-label={`Delete transaction draft for ${t.entityName}`}
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
 </section>
 );
}
