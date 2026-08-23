'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from '@/components/ThemeToggle';

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
      className="fixed top-5 left-0 right-0 z-50 flex justify-center px-4"
    >
      <nav className="flex items-center justify-between gap-6 sm:gap-8 px-6 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-full shadow-sm transition-all w-full max-w-6xl">
        
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shadow-sm shadow-purple-500/20 group-hover:scale-105 transition-transform">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Inscribe<span className="text-purple-600 dark:text-purple-400">AI</span>
          </span>
        </Link>

        {/* Meaningful Navbar Links pointing to actual sections */}
        <div className="hidden md:flex items-center gap-8">
          <button 
            onClick={() => scrollTo('features')} 
            className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
          >
            Features
          </button>

          <button 
            onClick={() => scrollTo('architecture')} 
            className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
          >
            Architecture
          </button>

          <button 
            onClick={() => scrollTo('deep-dive')} 
            className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
          >
            Capabilities
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-4">
          <ThemeToggle />

          <Link 
            href="/login"
            className="text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors hidden sm:block px-2 min-h-[44px] flex items-center"
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
