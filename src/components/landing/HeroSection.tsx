'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function HeroSection() {
 const easing = [0.22, 1, 0.36, 1] as const;

 return (
 <section id="hero" className="relative pt-28 sm:pt-36 lg:pt-40 pb-16 lg:pb-24 min-h-[90vh] flex items-center overflow-hidden transition-colors duration-300">
 <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10 w-full">
 {/* SPLIT SCREEN GRID: Left Column (~45% / 5-span), Right Column (~55% / 7-span) */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
 
 {/* LEFT COLUMN (~45% width): Text & CTAs */}
 <div className="lg:col-span-5 flex flex-col items-start text-left space-y-7">
 
 {/* Large Left-Aligned Headline (0.2s delay) */}
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.8, delay: 0.2, ease: easing }}
 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#111827] tracking-tight leading-[1.08] font-sans"
 >
 Next-Generation <br />
 <span className="text-purple-600 ">
 AI Bookkeeping
 </span>
 </motion.h1>

 {/* Left-Aligned Paragraph (0.3s delay) */}
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.8, delay: 0.3, ease: easing }}
 className="text-base sm:text-lg text-[#4B5563] leading-relaxed max-w-lg font-medium"
 >
 Let the AI handle data entry, verify transactions, and build reports while you maintain complete financial control.
 </motion.p>

 {/* Side-by-Side Left-Aligned CTA Buttons (0.4s delay) */}
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.8, delay: 0.4, ease: easing }}
 className="flex flex-row items-center gap-4 pt-1"
 >
 <Link 
 href="/dashboard"
 className="inline-flex justify-center items-center gap-2 px-7 py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-base rounded-full shadow-lg shadow-purple-500/25 hover:shadow-purple-500/35 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
 >
 <span>Enter Dashboard</span>
 <ArrowRight className="w-4 h-4" />
 </Link>
 
 <button 
 onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
 className="inline-flex justify-center items-center px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-base rounded-full border-2 border-slate-200 hover:border-slate-300 transition-all duration-200 cursor-pointer shadow-xs"
 >
 Explore Features
 </button>
 </motion.div>

 </div>

 {/* RIGHT COLUMN (~55% width): Real App Product Dashboard Screenshot */}
 <motion.div 
 initial={{ opacity: 0, scale: 0.95, y: 15 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 transition={{ duration: 1.2, delay: 0.4, ease: easing }}
 className="lg:col-span-7 relative w-full flex items-center justify-center"
 >
 {/* Floating App Panel Browser Frame */}
 <div className="relative w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden transition-all duration-300">
 
 {/* Window Control Bar */}
 <div className="px-4 py-2.5 bg-slate-100/90 border-b border-slate-200/80 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <div className="w-3 h-3 rounded-full bg-rose-400" />
 <div className="w-3 h-3 rounded-full bg-amber-400" />
 <div className="w-3 h-3 rounded-full bg-emerald-400" />
 </div>
 <div className="flex items-center gap-2 px-3 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-500 shadow-2xs">
 <span className="w-2 h-2 rounded-full bg-emerald-500" />
 <span>app.inscribe.ai/dashboard</span>
 </div>
 <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">
 Live System
 </div>
 </div>

 {/* Realistic Real App Screenshot Panel */}
 <div className="relative w-full aspect-[16/9] bg-slate-50 overflow-hidden">
 <Image
 src="/app_dashboard_screenshot.png"
 alt="Actual live SME AI Bookkeeper product dashboard UI screenshot displaying revenue, expenses, net position, cash flow, and AI assistant chat"
 fill
 sizes="(max-width: 1200px) 100vw, 1200px"
 className="object-cover object-top hover:scale-[1.01] transition-transform duration-500"
 priority
 />
 </div>

 </div>

 </motion.div>

 </div>
 </div>
 </section>
 );
}
