'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function HeroSection() {
  return (
    <section className="relative pt-32 lg:pt-48 pb-24 min-h-[75vh] flex items-center justify-center overflow-hidden transition-colors duration-300">
      
      {/* Subtle Noise Texture overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay dark:opacity-10 pointer-events-none z-0"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10 w-full flex flex-col items-center justify-center">
        
        {/* Centered Text Content */}
        <div className="max-w-4xl w-full text-center">
          <h1 className="text-4xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-6">
            Next-Generation <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-300">
              AI Bookkeeping
            </span>
          </h1>
          
          <p className="text-lg lg:text-xl text-slate-600 dark:text-slate-300 mb-10 leading-relaxed max-w-2xl mx-auto">
            Let the AI handle data entry, verify transactions, and build reports while you maintain complete financial control.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
            <Link 
              href="/dashboard"
              className="inline-flex justify-center items-center gap-2 px-10 py-5 bg-slate-900 dark:bg-white hover:bg-blue-600 dark:hover:bg-blue-500 text-white dark:text-slate-900 dark:hover:text-white font-bold text-lg rounded-full transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-1"
            >
              Enter Dashboard
              <ArrowRight className="w-6 h-6" />
            </Link>
            <button 
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex justify-center items-center px-10 py-5 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold text-lg rounded-full border-2 border-slate-200 dark:border-slate-700 transition-all duration-300"
            >
              Explore Features
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}
