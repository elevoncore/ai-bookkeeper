'use client';

import { Database, Network, Globe, MessageSquareText } from 'lucide-react';

const deepDiveItems = [
  {
    icon: <Network className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    title: 'AI Entity Resolution & Auditing',
    description: 'Matches natural language inputs to deterministic database identifiers (Products, Customers). Preserves original AI reasoning alongside every transaction for auditing.',
    bg: 'bg-amber-100 dark:bg-amber-500/10'
  },
  {
    icon: <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
    title: 'Dynamic WAC & Inventory Automation',
    description: 'Distinct behaviors for physical goods vs. services. Dynamic recalculation of inventory value via Weighted Average Cost (WAC) following new purchase bills.',
    bg: 'bg-blue-100 dark:bg-blue-500/10'
  },
  {
    icon: <Globe className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
    title: 'Multi-Currency Settlement Engine',
    description: 'Natively integrated US Dollars (USD) and Euros (EUR). Smart update logic tracking historical payments and recalculating totals seamlessly.',
    bg: 'bg-emerald-100 dark:bg-emerald-500/10'
  },
  {
    icon: <MessageSquareText className="w-6 h-6 text-purple-600 dark:text-purple-400" />,
    title: 'Conversational Financial Reporting',
    description: 'A powerful AI Clarification Engine allows you to query your financial data (P&L, Trial Balance, Cash Book) using natural language QUERY_REPORT intents.',
    bg: 'bg-purple-100 dark:bg-purple-500/10'
  }
];

export default function DeepDiveSection() {
  return (
    <section id="deep-dive" className="py-24 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-8 shadow-inner">
            <Database className="w-8 h-8 text-slate-700 dark:text-slate-300" />
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
            Advanced Capabilities
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Explore the deep technical features that power Inscribe AI&apos;s production-ready ERP system.
          </p>
        </div>

        <div className="space-y-6">
          {deepDiveItems.map((item, i) => (
            <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-8 p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${item.bg}`}>
                {item.icon}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3">{item.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-base leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
