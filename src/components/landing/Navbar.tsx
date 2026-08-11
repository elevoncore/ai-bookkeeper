'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4">
      <nav className="flex items-center justify-between gap-8 px-6 py-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 rounded-full shadow-lg shadow-slate-200/20 dark:shadow-black/40 transition-all">
        
        {/* Brand */}
        <div className="flex items-center gap-2 pr-4 border-r border-slate-200/50 dark:border-slate-700/50">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-sm">
            <BookOpen className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 hidden sm:block">
            Inscribe AI
          </span>
        </div>

        {/* Links */}
        <div className="hidden md:flex items-center gap-6">
          <button onClick={() => scrollTo('features')} className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Features</button>
          <button onClick={() => scrollTo('architecture')} className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Architecture</button>
          <button onClick={() => scrollTo('roadmap')} className="text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Roadmap</button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pl-4 border-l border-slate-200/50 dark:border-slate-700/50">
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle Dark Mode"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          <Link 
            href="/login"
            className="text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 transition-colors hidden sm:block"
          >
            Log in
          </Link>
          <Link 
            href="/dashboard"
            className="group flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white hover:bg-blue-600 dark:hover:bg-blue-500 text-white dark:text-slate-900 dark:hover:text-white text-sm font-bold rounded-full transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            Dashboard
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
