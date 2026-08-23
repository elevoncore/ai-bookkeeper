'use client';

import { motion } from 'framer-motion';

const columnsData = [
 {
 number: '1',
 title: 'AI ENTITY RESOLUTION',
 numberBorder: 'border-orange-500 text-orange-600 ',
 lineBg: 'bg-orange-500',
 hoverGlow: 'hover:border-orange-200 ',
 points: [
 'Natural Language to Deterministic IDs',
 'Automated Customer & Product Matching',
 'Immutable AI Audit Reasoning Logs'
 ]
 },
 {
 number: '2',
 title: 'WAC & INVENTORY',
 numberBorder: 'border-cyan-500 text-cyan-600 ',
 lineBg: 'bg-cyan-500',
 hoverGlow: 'hover:border-cyan-200 ',
 points: [
 'Weighted Average Cost (WAC) Tracking',
 'Goods vs Services Accounting Rules',
 'Automated Stocktake Reconciliation'
 ]
 },
 {
 number: '3',
 title: 'MULTI-CURRENCY',
 numberBorder: 'border-purple-500 text-purple-600 ',
 lineBg: 'bg-purple-500',
 hoverGlow: 'hover:border-purple-200 ',
 points: [
 'Multi-Currency Settlement (USD, EUR, PKR)',
 'Historical Payment Recalculations',
 'Atomic Balances & Overdraft Protection'
 ]
 },
 {
 number: '4',
 title: 'CONVERSATIONAL AI',
 numberBorder: 'border-emerald-500 text-emerald-600 ',
 lineBg: 'bg-emerald-500',
 hoverGlow: 'hover:border-emerald-200 ',
 points: [
 'Natural Language QUERY_REPORT Intents',
 'Live P&L, Cash Book & Trial Balance',
 'Instant Conversational Insights'
 ]
 }
];

export default function DeepDiveSection() {
 const easing = [0.22, 1, 0.36, 1] as const;

 return (
 <section id="deep-dive" className="py-20 sm:py-28 transition-colors duration-300 relative overflow-hidden">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
 
 {/* Main Left-Aligned Headline (Slides up first) */}
 <motion.div 
 initial={{ opacity: 0, y: 30 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true, margin: '-60px' }}
 transition={{ duration: 0.8, ease: easing }}
 className="text-left max-w-3xl mb-16 sm:mb-20"
 >
 <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
 Advanced Capabilities
 </h2>
 <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
 Explore the deep technical features that power Inscribe AI&apos;s production-ready ERP system.
 </p>
 </motion.div>

 {/* 4 Sequential Columns Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
 {columnsData.map((col, index) => (
 <motion.div
 key={index}
 initial={{ opacity: 0, y: 40 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true, margin: '-40px' }}
 transition={{ 
 duration: 0.8, 
 delay: 0.2 + index * 0.15, // Sequential cascade: 0.2s, 0.35s, 0.50s, 0.65s
 ease: easing 
 }}
 className={`p-6 sm:p-7 rounded-3xl bg-slate-50/90 backdrop-blur-sm border border-slate-200/80 transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 ${col.hoverGlow} flex flex-col`}
 >
 {/* Column Header: Number & Title */}
 <div className="flex items-center gap-3.5 mb-7">
 <div className={`w-8 h-8 rounded-full border-2 ${col.numberBorder} flex items-center justify-center font-extrabold text-sm shrink-0 font-mono shadow-2xs`}>
 {col.number}
 </div>
 <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-wider uppercase font-sans">
 {col.title}
 </h3>
 </div>

 {/* Column Body: Colored Vertical Line + Bullet Points */}
 <div className="flex gap-4 sm:gap-5 items-stretch flex-1">
 {/* Vertical Accent Line */}
 <div className={`w-1 rounded-full ${col.lineBg} shrink-0 opacity-90`} />

 {/* Stacked Bullet Points */}
 <div className="flex flex-col justify-between py-0.5 space-y-5 text-sm sm:text-base font-medium text-slate-700 leading-snug">
 {col.points.map((point, pIdx) => (
 <p key={pIdx} className="hover:text-slate-900 transition-colors">
 {point}
 </p>
 ))}
 </div>
 </div>

 </motion.div>
 ))}
 </div>

 </div>
 </section>
 );
}
