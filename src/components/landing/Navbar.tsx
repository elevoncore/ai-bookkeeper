'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar() {
 const scrollTo = (id: string) => {
 const el = document.getElementById(id);
 if (el) {
 el.scrollIntoView({ behavior: 'smooth' });
 }
 };

 const easing = [0.22, 1, 0.36, 1] as const;

 return (
 <motion.div 
 initial={{ opacity: 0, y: -20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ duration: 0.8, delay: 0, ease: easing }}
 className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4"
 >
 <nav className="flex items-center justify-between gap-4 sm:gap-6 px-2.5 sm:px-3 py-1.5 bg-white/20 backdrop-blur-[40px] border border-white/60 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.06)] transition-all w-max min-w-[280px]">
 
 {/* Brand Logo */}
 <Link href="/" className="flex items-center gap-2.5 group">
 <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shadow-sm shadow-purple-500/20 group-hover:scale-105 transition-transform">
 <BookOpen className="w-4 h-4" />
 </div>
 <span className="text-lg font-bold text-slate-900 tracking-tight">
 Inscribe<span className="text-purple-600">AI</span>
 </span>
 </Link>

 {/* Meaningful Navbar Links pointing to actual sections */}
 <div className="hidden md:flex items-center gap-8">
 <button 
 onClick={() => scrollTo('features')} 
 className="text-sm font-semibold text-slate-600 hover:text-purple-600 transition-colors cursor-pointer"
 >
 Features
 </button>

 <button 
 onClick={() => scrollTo('architecture')} 
 className="text-sm font-semibold text-slate-600 hover:text-purple-600 transition-colors cursor-pointer"
 >
 Architecture
 </button>

 <button 
 onClick={() => scrollTo('deep-dive')} 
 className="text-sm font-semibold text-slate-600 hover:text-purple-600 transition-colors cursor-pointer"
 >
 Capabilities
 </button>
 </div>

 {/* Action Controls */}
 <div className="flex items-center gap-3 sm:gap-4">
 <Link 
 href="/login"
 className="text-sm font-bold text-slate-600 hover:text-purple-600 transition-colors hidden sm:flex items-center justify-center px-2 py-2"
 >
 Log in
 </Link>

 <Link 
 href="/dashboard"
 className="group inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 min-h-[44px] rounded-full bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md hover:shadow-purple-500/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-purple-500"
 >
 <span>Dashboard</span>
 <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
 </Link>
 </div>
 </nav>
 </motion.div>
 );
}
