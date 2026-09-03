'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  ShieldAlert, 
  Sparkles, 
  TrendingUp, 
  Clock, 
  Zap,
  Check
} from 'lucide-react';
import Link from 'next/link';

export interface ActionItem {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'red' | 'yellow' | 'green';
  headline: string;
  description: string;
  action_label: string;
  action_route: string;
  is_resolved: boolean;
  created_at?: string;
}

interface ActionCenterProps {
  onNavigate?: (route: string) => void;
}

export default function ActionCenter({ onNavigate }: ActionCenterProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    fetchActionItems();
  }, []);

  async function fetchActionItems() {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // 1. Attempt fetching unresolved action items from database
      const { data: dbItems, error } = await supabase
        .from('ai_action_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_resolved', false)
        .order('created_at', { ascending: false });

      if (!error && dbItems && dbItems.length > 0) {
        setItems(dbItems);
      } else {
        // 2. Real-time CFO Heuristic fallback if DB table is empty or unpopulated
        const fallbackItems = await generateRealtimeHeuristics(user.id);
        setItems(fallbackItems);
      }
    } catch (e) {
      console.error("[Action Center] Failed to fetch action items:", e);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateRealtimeHeuristics(userId: string): Promise<ActionItem[]> {
    try {
      const [invoicesRes, billsRes, journalsRes] = await Promise.all([
        supabase.from('invoices').select('id, total_amount, balance_due, status').eq('user_id', userId),
        supabase.from('bills').select('id, total_amount, balance_due, status').eq('user_id', userId),
        supabase.from('journal_entries').select('id, date, journal_lines(debit, credit, account_id, accounts(name, is_cash_account, type))').eq('user_id', userId)
      ]);

      const invoices = invoicesRes.data || [];
      const bills = billsRes.data || [];
      const journals = journalsRes.data || [];

      const openInvoices = invoices.filter(i => i.status !== 'paid' && Number(i.balance_due || 0) > 0);
      const totalAR = openInvoices.reduce((s, i) => s + Number(i.balance_due || 0), 0);

      const openBills = bills.filter(b => b.status !== 'paid' && Number(b.balance_due || 0) > 0);
      const totalAP = openBills.reduce((s, b) => s + Number(b.balance_due || 0), 0);

      let liquidCash = 0;
      journals.forEach(j => {
        (j.journal_lines || []).forEach((l: any) => {
          const acc = Array.isArray(l.accounts) ? l.accounts[0] : l.accounts;
          if (acc?.is_cash_account || (acc?.type === 'asset' && (acc?.name?.toLowerCase().includes('bank') || acc?.name?.toLowerCase().includes('cash')))) {
            liquidCash += (Number(l.debit || 0) - Number(l.credit || 0));
          }
        });
      });

      const items: ActionItem[] = [];

      if (totalAR > 0) {
        items.push({
          id: 'rt-ar-1',
          severity: 'high',
          headline: 'Severe Aging Receivables Detected',
          description: `You have ${openInvoices.length} outstanding invoice(s) totaling PKR ${totalAR.toLocaleString()} awaiting customer payment.`,
          action_label: 'Review Overdue Invoices',
          action_route: '/dashboard?tab=invoices',
          is_resolved: false
        });
      }

      if (liquidCash < totalAP && totalAP > 0) {
        items.push({
          id: 'rt-liq-2',
          severity: 'high',
          headline: 'Critical Liquidity Reserve Deficit',
          description: `Liquid cash reserves (PKR ${liquidCash.toLocaleString()}) are below upcoming vendor payables (PKR ${totalAP.toLocaleString()}).`,
          action_label: 'Manage Payables & Cash',
          action_route: '/dashboard?tab=bills',
          is_resolved: false
        });
      } else if (totalAP > 0) {
        items.push({
          id: 'rt-ap-3',
          severity: 'medium',
          headline: 'Vendor Payment Obligations Due',
          description: `${openBills.length} unpaid bill(s) totaling PKR ${totalAP.toLocaleString()} require payment execution.`,
          action_label: 'Review Vendor Bills',
          action_route: '/dashboard?tab=bills',
          is_resolved: false
        });
      }

      if (items.length === 0) {
        items.push({
          id: 'rt-ok-4',
          severity: 'low',
          headline: 'Healthy Financial Status',
          description: 'No liquidity deficits or overdue collection risks detected. Your cash flow and books are balanced.',
          action_label: 'Explore Reports Hub',
          action_route: '/dashboard?tab=reports',
          is_resolved: false
        });
      }

      return items;
    } catch {
      return [];
    }
  }

  async function handleResolve(id: string) {
    setResolvingId(id);
    try {
      if (!id.startsWith('rt-')) {
        await supabase
          .from('ai_action_items')
          .update({ is_resolved: true })
          .eq('id', id);
      }
      setItems(current => current.filter(item => item.id !== id));
    } catch (e) {
      console.error("Failed to resolve action item:", e);
    } finally {
      setResolvingId(null);
    }
  }

  function handleActionClick(route: string) {
    if (onNavigate) {
      onNavigate(route);
    }
  }

  const getSeverityBadge = (severity: string) => {
    const norm = severity.toLowerCase();
    if (norm === 'high' || norm === 'red') {
      return {
        bg: 'bg-rose-500/10 text-rose-600 border-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50',
        icon: <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
        dot: '🔴',
        borderLeft: 'border-l-4 border-l-rose-500'
      };
    }
    if (norm === 'medium' || norm === 'yellow') {
      return {
        bg: 'bg-amber-500/10 text-amber-700 border-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
        dot: '🟡',
        borderLeft: 'border-l-4 border-l-amber-500'
      };
    }
    return {
      bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      dot: '🟢',
      borderLeft: 'border-l-4 border-l-emerald-500'
    };
  };

  return (
    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl rounded-2xl shadow-xl border border-slate-200/60 dark:border-slate-800 p-6 transition-all duration-300">
      
      {/* HEADER */}
      <div className="flex items-center justify-between pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200/50 dark:border-indigo-800/50">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Digital CFO Action Center
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-500/20">
                Autonomous
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time anomaly detection &amp; clickable CFO resolution items
            </p>
          </div>
        </div>

        <button 
          onClick={fetchActionItems} 
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          {isLoading ? (
            <Sparkles className="w-3.5 h-3.5 animate-spin text-indigo-500" />
          ) : (
            <Clock className="w-3.5 h-3.5" />
          )}
          Refresh
        </button>
      </div>

      {/* SMART CARDS FEED */}
      {isLoading ? (
        <div className="py-10 text-center space-y-3">
          <Sparkles className="w-6 h-6 text-indigo-500 animate-spin mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Evaluating CFO Heuristics &amp; Action Items...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center space-y-2 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">No Pending CFO Action Items</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">All financial anomalies and risks have been resolved.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const badge = getSeverityBadge(item.severity);
            const isResolving = resolvingId === item.id;

            return (
              <div
                key={item.id}
                className={`relative bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200/80 dark:border-slate-800/80 hover:shadow-md transition-all duration-200 ${badge.borderLeft}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  
                  {/* Content */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{badge.dot}</span>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {item.headline}
                      </h3>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${badge.bg}`}>
                        {item.severity}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                    <Link
                      href={item.action_route}
                      onClick={() => handleActionClick(item.action_route)}
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      {item.action_label}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>

                    <button
                      onClick={() => handleResolve(item.id)}
                      disabled={isResolving}
                      title="Dismiss & Resolve Action Item"
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 cursor-pointer"
                    >
                      {isResolving ? (
                        <Sparkles className="w-4 h-4 text-emerald-500 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
