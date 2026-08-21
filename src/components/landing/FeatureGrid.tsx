'use client';

import { Bot, Scale, Receipt, Box, LineChart, Users } from 'lucide-react';
import { motion } from 'framer-motion';

const features = [
  {
    icon: <Bot className="w-6 h-6" />,
    title: 'AI & Natural Language',
    description: 'Convert conversational instructions into structured, double-entry records. Features AI Entity Resolution, Conversational Reporting, and full AI Audit Logging.',
    color: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    borderColor: 'group-hover:border-blue-200 dark:group-hover:border-blue-500/30'
  },
  {
    icon: <Scale className="w-6 h-6" />,
    title: 'Core Ledger Engine',
    description: 'Strictly enforced database-level rules where Debits = Credits. Immutable verified financial records with a comprehensive Chart of Accounts and Cash Book.',
    color: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    borderColor: 'group-hover:border-indigo-200 dark:group-hover:border-indigo-500/30'
  },
  {
    icon: <Receipt className="w-6 h-6" />,
    title: 'AP/AR & Settlement',
    description: 'End-to-end management of customer invoices and supplier bills. Atomic settlement engine tracks historical payments and prevents negative balances.',
    color: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    borderColor: 'group-hover:border-emerald-200 dark:group-hover:border-emerald-500/30'
  },
  {
    icon: <Box className="w-6 h-6" />,
    title: 'Inventory & COGS',
    description: 'Automated 4-line sales accounting for physical products. Features dynamic Weighted Average Cost (WAC) tracking and stocktake reconciliation workflows.',
    color: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    borderColor: 'group-hover:border-amber-200 dark:group-hover:border-amber-500/30'
  },
  {
    icon: <LineChart className="w-6 h-6" />,
    title: 'Financial Reporting',
    description: 'Real-time financial visibility natively derived from the ledger. Features a complete General Ledger, live Trial Balance checking, and full Profit & Loss (P&L).',
    color: 'bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
    borderColor: 'group-hover:border-fuchsia-200 dark:group-hover:border-fuchsia-500/30'
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Human-in-the-Loop',
    description: 'You retain ultimate control. Dedicated interfaces allow humans to manually create, review, and override AI-generated financial records and catalog data.',
    color: 'bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400',
    borderColor: 'group-hover:border-purple-200 dark:group-hover:border-purple-500/30'
  }
];

// Custom non-linear domino stagger delay (seconds) for dynamic organic grid pop-in effect
const dominoDelays = [0.05, 0.16, 0.09, 0.22, 0.33, 0.27];

export default function FeatureGrid() {
  const easing = [0.22, 1, 0.36, 1] as const;

  return (
    <section id="features" className="py-24 relative transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header: Slide-up Entrance */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: easing }}
          className="text-center max-w-3xl mx-auto mb-20 flex flex-col items-center"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
            Key <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400">Features</span>
          </h2>
          
          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            Built on a solid accounting foundation. Inscribe AI is a massive, fully-featured ERP system in production. From Weighted Average Cost inventory to AI Entity Resolution, it handles everything.
          </p>
        </motion.div>

        {/* 6 Grid Items: Dynamic Staggered Domino Grid Effect */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 35, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ 
                duration: 0.6, 
                delay: dominoDelays[index], 
                ease: easing 
              }}
              className={`group p-8 rounded-[2rem] bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm border border-slate-100 dark:border-slate-800 transition-all duration-500 hover:shadow-2xl hover:shadow-blue-500/5 dark:hover:shadow-blue-900/20 hover:-translate-y-2 ${feature.borderColor}`}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-transform duration-500 group-hover:scale-110 ${feature.color}`}>
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">{feature.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
