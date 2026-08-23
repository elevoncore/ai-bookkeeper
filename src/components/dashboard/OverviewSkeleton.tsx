'use client';

import React from 'react';

export default function OverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* 1. WELCOME & QUICK KPIS HEADER SKELETON */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/70 backdrop-blur-3xl p-6 sm:p-8 rounded-3xl border border-white/50 shadow-xl">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200/80 rounded-xl" />
          <div className="h-4 w-72 bg-slate-100 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-slate-200/60 rounded-xl" />
          <div className="h-9 w-32 bg-slate-200/60 rounded-xl" />
        </div>
      </div>

      {/* 2. BENTO STATS 4-CARD KPI GRID SKELETON */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white/70 backdrop-blur-3xl rounded-3xl p-5 border border-white/50 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-slate-200/70 rounded-md" />
              <div className="h-8 w-8 bg-slate-200/80 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <div className="h-7 w-32 bg-slate-300/80 rounded-lg" />
              <div className="h-3 w-20 bg-slate-100 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* 3. CASH FLOW CHART & LIQUID ACCOUNTS SKELETON */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Cash Flow Timeline Chart Box */}
        <div className="lg:col-span-8 bg-white/70 backdrop-blur-3xl rounded-3xl p-6 sm:p-8 border border-white/50 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1.5">
              <div className="h-5 w-40 bg-slate-200/80 rounded-lg" />
              <div className="h-3 w-56 bg-slate-100 rounded-md" />
            </div>
            <div className="h-8 w-24 bg-slate-100 rounded-lg" />
          </div>
          <div className="h-64 w-full bg-slate-100/70 rounded-2xl flex items-end p-4 gap-3">
            {[40, 65, 30, 80, 55, 90, 45, 70, 85, 60].map((h, idx) => (
              <div
                key={idx}
                className="flex-1 bg-slate-200/60 rounded-t-lg transition-all"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Right: Cash & Bank Accounts Cards */}
        <div className="lg:col-span-4 bg-white/70 backdrop-blur-3xl rounded-3xl p-6 border border-white/50 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="h-5 w-36 bg-slate-200/80 rounded-lg" />
            <div className="h-4 w-12 bg-slate-100 rounded-md" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="p-4 rounded-2xl border border-slate-100 bg-white/50 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 bg-slate-200/80 rounded-md" />
                  <div className="h-5 w-5 bg-slate-200/60 rounded-full" />
                </div>
                <div className="h-6 w-32 bg-slate-300/80 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. AGING SUMMARY BUCKETS SKELETON */}
      <div className="bg-white/70 backdrop-blur-3xl rounded-3xl p-6 sm:p-8 border border-white/50 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="space-y-1.5">
            <div className="h-5 w-48 bg-slate-200/80 rounded-lg" />
            <div className="h-3 w-64 bg-slate-100 rounded-md" />
          </div>
          <div className="h-8 w-28 bg-slate-100 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((panel) => (
            <div key={panel} className="space-y-3">
              <div className="h-4 w-32 bg-slate-200/70 rounded-md" />
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((bucket) => (
                  <div
                    key={bucket}
                    className="p-3 bg-slate-100/60 rounded-xl space-y-1.5"
                  >
                    <div className="h-3 w-12 bg-slate-200/60 rounded-md" />
                    <div className="h-4 w-16 bg-slate-300/70 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
