'use client';

import { FileText, Cpu, Database, CheckSquare, ArrowRight } from 'lucide-react';

export default function WorkflowSection() {
  return (
    <section id="architecture" className="py-24 border-y border-slate-100 dark:border-slate-900 transition-colors duration-300">
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
              Inscribe AI is built on a Human-in-the-Loop Architecture where the AI drafts records and handles Entity Resolution, but you retain ultimate financial control to verify and commit.
            </p>
            
            <div className="space-y-8">
              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Natural-Language Entry</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">Convert conversational instructions or uploaded documents into structured financial records.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Cpu className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">AI Entity Resolution & Audit</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">Matches inputs to deterministic IDs (Products/Customers) and preserves reasoning via AI Audit Logging.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <CheckSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Human-in-the-Loop Review</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">You manually review, edit, and override AI-generated financial records before they become permanent.</p>
                </div>
              </div>

              <div className="flex items-start gap-6 group">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Database className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Immutable Ledger Commit</h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">Strictly enforces Debits = Credits and prevents destructive deletion of verified records.</p>
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
                    <p className="font-bold text-lg text-slate-900 dark:text-slate-100">AI Entity Resolution</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Natural Language to Deterministic IDs</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="w-8 h-8 text-slate-300 dark:text-slate-600 rotate-90" />
                </div>

                {/* Flow Step 2 */}
                <div className="flex items-center gap-6 p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-500/20 group hover:-translate-y-1 transition-transform">
                  <div className="w-14 h-14 bg-purple-200 dark:bg-purple-500/30 rounded-xl flex items-center justify-center text-purple-700 dark:text-purple-400 font-bold text-xl shadow-inner">2</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-purple-900 dark:text-purple-300">Human Validation Layer</p>
                    <p className="text-sm text-purple-600/80 dark:text-purple-400/80 mt-1">Manual Review & Override</p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <ArrowRight className="w-8 h-8 text-slate-300 dark:text-slate-600 rotate-90" />
                </div>

                {/* Flow Step 3 */}
                <div className="flex items-center gap-6 p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 group hover:-translate-y-1 transition-transform">
                  <div className="w-14 h-14 bg-emerald-200 dark:bg-emerald-500/30 rounded-xl flex items-center justify-center text-emerald-700 dark:text-emerald-400 font-bold text-xl shadow-inner">3</div>
                  <div className="flex-1">
                    <p className="font-bold text-lg text-emerald-900 dark:text-emerald-300">Immutable General Ledger</p>
                    <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80 mt-1">Strict Double-Entry Enforcement</p>
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
