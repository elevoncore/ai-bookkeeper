'use client';

import { Bot, Scale, Receipt, ShieldCheck } from 'lucide-react';

const features = [
  {
    icon: <Bot className="w-6 h-6" />,
    title: 'AI-Powered Bookkeeping',
    description: 'Turn natural-language chat into structured bookkeeping records seamlessly. The AI complements your workflow rather than replacing it.',
    color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'group-hover:border-blue-200 dark:group-hover:border-blue-500/30'
  },
  {
    icon: <Scale className="w-6 h-6" />,
    title: 'Double-Entry Foundation',
    description: 'Strictly enforced Debits = Credits. Built on atomic financial operations to prevent partial writes and ensure perfect ledger balance.',
    color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    borderColor: 'group-hover:border-indigo-200 dark:group-hover:border-indigo-500/30'
  },
  {
    icon: <Receipt className="w-6 h-6" />,
    title: 'Invoice & Bill Management',
    description: 'Track receivables and payables easily. Automatically sync AI-verified states across your general ledger and outstanding balances.',
    color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    borderColor: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-500/30'
  },
  {
    icon: <ShieldCheck className="w-6 h-6" />,
    title: 'Security & Integrity',
    description: 'Ownership-based Row Level Security (RLS) protects your data. AI-verified records are immutable and protected against destructive manipulation.',
    color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400',
    borderColor: 'group-hover:border-purple-200 dark:group-hover:border-purple-500/30'
  }
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-24 bg-white dark:bg-slate-950 relative transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
            Built on a solid <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400">
              accounting foundation
            </span>
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
            Inscribe AI isn&apos;t just a pretty interface. Beneath the surface is a rigid, double-entry financial engine designed for precision and trust.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index}
              className={`group p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-100 dark:border-slate-800 transition-all duration-500 hover:shadow-2xl hover:shadow-blue-500/5 dark:hover:shadow-blue-900/20 hover:-translate-y-2 ${feature.borderColor}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-transform duration-500 group-hover:scale-110 ${feature.color}`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">{feature.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
