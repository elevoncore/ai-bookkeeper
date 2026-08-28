'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

export default function HeroSection() {
  return (
    <section id="hero" className="relative pt-28 sm:pt-36 lg:pt-40 pb-16 lg:pb-24 min-h-[90vh] flex items-center overflow-hidden transition-colors duration-300">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 z-10 w-full">

          {/* CENTERED CONTENT */}
          <div className="flex flex-col items-center justify-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-700 max-w-4xl mx-auto z-10 relative pt-10 sm:pt-16">
            
            {/* Large Centered Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-[#111827] tracking-tight leading-[1.1] font-sans drop-shadow-sm">
              Next-Generation <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                AI Bookkeeping
              </span>
            </h1>

            {/* Centered Paragraph */}
            <p className="text-base sm:text-lg lg:text-xl text-[#4B5563] leading-relaxed max-w-2xl font-medium">
              Let the AI handle data entry, verify transactions, and build reports while you maintain complete financial control.
            </p>

            {/* Centered CTA Buttons */}
            <div className="flex flex-row items-center justify-center gap-4 pt-4">
              <Link 
                href="/dashboard"
                className="inline-flex justify-center items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-base rounded-full shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer whitespace-nowrap border border-purple-500/50"
              >
                <span>Enter Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              
              <button 
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex justify-center items-center px-8 py-4 bg-white/80 backdrop-blur-md hover:bg-white text-slate-700 font-bold text-base rounded-full border-2 border-slate-200 hover:border-slate-300 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md whitespace-nowrap"
              >
                Explore Features
              </button>
            </div>

          </div>
      </div>
    </section>
  );
}
