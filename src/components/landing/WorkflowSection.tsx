'use client';

import { FileText, Cpu, Database, CheckSquare, ArrowDown, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

const workflowSteps = [
 {
 icon: <FileText className="w-6 h-6 text-blue-600 " />,
 title: 'Natural-Language Entry',
 description: 'Convert conversational instructions or uploaded documents into structured financial records.',
 bgColor: 'bg-blue-100 ',
 hoverBorder: 'group-hover:border-blue-200 '
 },
 {
 icon: <Cpu className="w-6 h-6 text-indigo-600 " />,
 title: 'AI Entity Resolution & Audit',
 description: 'Matches inputs to deterministic IDs (Products/Customers) and preserves reasoning via AI Audit Logging.',
 bgColor: 'bg-indigo-100 ',
 hoverBorder: 'group-hover:border-indigo-200 '
 },
 {
 icon: <CheckSquare className="w-6 h-6 text-purple-600 " />,
 title: 'Human-in-the-Loop Review',
 description: 'You manually review, edit, and override AI-generated financial records before they become permanent.',
 bgColor: 'bg-purple-100 ',
 hoverBorder: 'group-hover:border-purple-200 '
 },
 {
 icon: <Database className="w-6 h-6 text-emerald-600 " />,
 title: 'Immutable Ledger Commit',
 description: 'Strictly enforces Debits = Credits and prevents destructive deletion of verified records.',
 bgColor: 'bg-emerald-100 ',
 hoverBorder: 'group-hover:border-emerald-200 '
 }
];

export default function WorkflowSection() {
 const easing = [0.22, 1, 0.36, 1] as const;

 return (
 <section id="architecture" className="py-16 sm:py-24 border-y border-slate-100 transition-colors duration-300 relative overflow-hidden">
 
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
 <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-center">
 
 {/* LEFT COLUMN: Section Description & Interactive List */}
 <div className="w-full lg:w-1/2 flex flex-col items-start text-left">
 
 {/* Header Slide-up Animation */}
 <motion.div
 initial={{ opacity: 0, y: 30 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true, margin: '-60px' }}
 transition={{ duration: 0.8, ease: easing }}
 >
 <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 mb-6 tracking-tight leading-[1.15]">
 The Perfect Synergy of <br />
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 ">
 Human & Machine
 </span>
 </h2>

 <p className="text-base sm:text-lg text-slate-600 mb-10 leading-relaxed max-w-xl">
 Inscribe AI is built on a Human-in-the-Loop Architecture where the AI drafts records and handles Entity Resolution, but you retain ultimate financial control to verify and commit.
 </p>
 </motion.div>
 
 {/* 4 Feature Items: Staggered Fade & Slide Right */}
 <div className="space-y-6 sm:space-y-8 w-full">
 {workflowSteps.map((step, index) => (
 <motion.div 
 key={index}
 initial={{ opacity: 0, x: -30 }}
 whileInView={{ opacity: 1, x: 0 }}
 viewport={{ once: true, margin: '-40px' }}
 transition={{ duration: 0.6, delay: index * 0.1, ease: easing }}
 className={`flex items-start gap-4 sm:gap-6 group p-3 sm:p-4 rounded-2xl transition-all duration-300 hover:bg-slate-50/80 border border-transparent ${step.hoverBorder}`}
 >
 <div className={`w-12 h-12 rounded-2xl ${step.bgColor} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-xs`}>
 {step.icon}
 </div>
 <div>
 <h4 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 sm:mb-2">{step.title}</h4>
 <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{step.description}</p>
 </div>
 </motion.div>
 ))}
 </div>
 </div>

 {/* RIGHT COLUMN: Animated Architecture Flow Diagram */}
 <motion.div 
 initial={{ opacity: 0, scale: 0.95, y: 30 }}
 whileInView={{ opacity: 1, scale: 1, y: 0 }}
 viewport={{ once: true, margin: '-60px' }}
 transition={{ duration: 0.9, delay: 0.2, ease: easing }}
 className="w-full lg:w-1/2"
 >
 <div className="relative bg-white/90 backdrop-blur-xl p-6 sm:p-8 lg:p-10 rounded-[2.5rem] shadow-2xl border border-slate-200/80 transition-all duration-300">
 
 {/* Top Live Ticker Badge */}
 <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-8">
 <div className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
 <span className="text-xs font-mono font-bold text-slate-700 tracking-wider uppercase pl-1">
 Human-in-the-Loop Engine
 </span>
 </div>
 <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-semibold">
 <ShieldCheck className="w-3.5 h-3.5 text-purple-600 " />
 <span>Verified Deterministic</span>
 </div>
 </div>

 {/* Flow Steps */}
 <div className="flex flex-col gap-5 sm:gap-6 relative">
 
 {/* Step 1 Card */}
 <motion.div 
 whileHover={{ scale: 1.02, y: -2 }}
 transition={{ duration: 0.2 }}
 className="flex items-center gap-4 sm:gap-6 p-5 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs cursor-pointer group"
 >
 <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-500 text-white rounded-xl flex items-center justify-center font-extrabold text-xl shadow-md shadow-blue-500/20 shrink-0 group-hover:scale-105 transition-transform">
 1
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <p className="font-bold text-base sm:text-lg text-slate-900 truncate">AI Entity Resolution</p>
 <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">Automated</span>
 </div>
 <p className="text-xs sm:text-sm text-slate-500 mt-1">Natural Language ➔ Deterministic Record Draft</p>
 </div>
 </motion.div>

 {/* Arrow Connector 1 */}
 <div className="flex justify-center -my-2 relative z-10">
 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-2xs">
 <ArrowDown className="w-4 h-4 text-blue-500 " />
 </div>
 </div>

 {/* Step 2 Card (Human Validation Layer - Highlighted) */}
 <motion.div 
 whileHover={{ scale: 1.02, y: -2 }}
 transition={{ duration: 0.2 }}
 className="flex items-center gap-4 sm:gap-6 p-5 sm:p-6 rounded-2xl bg-purple-50/90 border border-purple-200/90 shadow-xs cursor-pointer group"
 >
 <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-600 text-white rounded-xl flex items-center justify-center font-extrabold text-xl shadow-md shadow-purple-500/25 shrink-0 group-hover:scale-105 transition-transform">
 2
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <p className="font-bold text-base sm:text-lg text-purple-950 truncate">Human Validation Layer</p>
 <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-200/80 text-purple-800 shrink-0">Human Control</span>
 </div>
 <p className="text-xs sm:text-sm text-purple-700/80 mt-1">Manual Review, Verification & Override</p>
 </div>
 </motion.div>

 {/* Arrow Connector 2 */}
 <div className="flex justify-center -my-2 relative z-10">
 <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shadow-2xs">
 <ArrowDown className="w-4 h-4 text-purple-500 " />
 </div>
 </div>

 {/* Step 3 Card */}
 <motion.div 
 whileHover={{ scale: 1.02, y: -2 }}
 transition={{ duration: 0.2 }}
 className="flex items-center gap-4 sm:gap-6 p-5 sm:p-6 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 shadow-xs cursor-pointer group"
 >
 <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-extrabold text-xl shadow-md shadow-emerald-500/25 shrink-0 group-hover:scale-105 transition-transform">
 3
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <p className="font-bold text-base sm:text-lg text-emerald-950 truncate">Immutable General Ledger</p>
 <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-200/80 text-emerald-800 shrink-0 flex items-center gap-1">
 <CheckCircle2 className="w-3 h-3" /> Immutable
 </span>
 </div>
 <p className="text-xs sm:text-sm text-emerald-700/80 mt-1">Strict Double-Entry (Debits = Credits)</p>
 </div>
 </motion.div>

 </div>

 </div>
 </motion.div>

 </div>
 </div>
 </section>
 );
}
