'use client';

import { Rocket, Box, Users, LineChart } from 'lucide-react';

const roadmapItems = [
  {
    icon: <Users className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
    title: 'Accounts Receivable & Payable',
    description: 'Complete AR/AP tracking. From partial payments and outstanding balances to full settlement workflows.',
    bg: 'bg-amber-100 dark:bg-amber-500/10'
  },
  {
    icon: <Box className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
    title: 'Products, Inventory & COGS',
    description: 'Track stock movement, costing, and Gross Profit by connecting product sales directly to profitability.',
    bg: 'bg-blue-100 dark:bg-blue-500/10'
  },
  {
    icon: <LineChart className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
    title: 'Complete Financial Statements',
    description: 'Fully reliable P&L, Balance Sheet, and Cash-flow reporting derived natively from the accounting engine.',
    bg: 'bg-emerald-100 dark:bg-emerald-500/10'
  }
];

export default function RoadmapSection() {
  return (
    <section id="roadmap" className="py-24 bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-8 shadow-inner">
            <Rocket className="w-8 h-8 text-slate-700 dark:text-slate-300" />
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
            The Road Ahead
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto">
            Inscribe AI is continuously evolving. Here is a glimpse into the sophisticated accounting architecture we are building next.
          </p>
        </div>

        <div className="space-y-6">
          {roadmapItems.map((item, i) => (
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
