'use client';

import { FileText, Cpu, Database, CheckSquare, ArrowRight } from 'lucide-react';

export default function WorkflowSection() {
  return (
    <section id="architecture" className="py-24 bg-white dark:bg-slate-950 border-y border-slate-100 dark:border-slate-900 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-20 items-center">
          
          <div className="w-full lg:w-1/2">
            <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
              The Perfect Synergy of <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400">
                Human & Machine
              </span>
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-12 leading-relaxed">
              Inscribe AI is built on a destination architecture where AI assists but does not override. The system takes natural language and transforms it into structured bookkeeping data, which is then validated and securely stored in our double-entry ledger.
            </p>
            
            <div className="space-y-8">
              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Natural Input</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">You upload a receipt or type a quick request.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Cpu className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Gemini AI Extraction</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">AI structures the data accurately into accounting domains.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Database className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Atomic Database Commit</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">Safely written to PostgreSQL using strict RPC transactions.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <CheckSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Human Review</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">You retain final approval to verify and finalize records.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Architecture Diagram Representation */}
          <div className="w-full lg:w-1/2">
            <div className="bg-white dark:bg-slate-900/80 backdrop-blur-xl p-10 rounded-[2.5rem] shadow-2xl dark:shadow-black/50 border border-slate-100 dark:border-slate-800">
              <div className="flex flex-col gap-6">
                {/* Flow Step 1 */}
                <div className="flex items-center gap-6 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 group hover:-translate-y-1 transition-transform">
                  <div className="w-14 h-14 bg-blue-100 dark:bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xl shadow-inner">1</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">Human UI / Chat</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="w-8 h-8 text-slate-300 dark:text-slate-600 rotate-90" />
                </div>

                {/* Flow Step 2 */}
                <div className="flex items-center gap-6 p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20 group hover:-translate-y-1 transition-transform">
                  <div className="w-14 h-14 bg-indigo-200 dark:bg-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold text-xl shadow-inner">2</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-indigo-900 dark:text-indigo-300">Validation Layer</p>
                    <p className="text-sm text-indigo-600/80 dark:text-indigo-400/80 mt-1">Entity Resolution & Precision</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="w-8 h-8 text-slate-300 dark:text-slate-600 rotate-90" />
                </div>

                {/* Flow Step 3 */}
                <div className="flex items-center gap-6 p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 group hover:-translate-y-1 transition-transform">
                  <div className="w-14 h-14 bg-emerald-200 dark:bg-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-xl shadow-inner">3</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-emerald-900 dark:text-emerald-300">Double-Entry Ledger</p>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80 mt-1">PostgreSQL / Supabase</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
