import fs from 'fs';
import path from 'path';

const projectPath = 'd:\\build\\ai-bookkeeper';
const filePath = path.join(projectPath, 'src', 'components', 'dashboard', 'ChartOfAccountsManager.tsx');
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

// 1. Add next/link import
const importOld = "import { useState, useEffect, useMemo } from 'react';";
const importNew = "import { useState, useEffect, useMemo } from 'react';\nimport Link from 'next/link';";
content = content.replace(importOld, importNew);

// 2. Add RefreshCw to lucide-react import list
const lucideOld = "ArrowLeftRight\n} from 'lucide-react';";
const lucideNew = "ArrowLeftRight,\n  RefreshCw\n} from 'lucide-react';";
content = content.replace(lucideOld, lucideNew);

// 3. Add useMemo and Year-End Close handler inside ChartOfAccountsManager component
// Let's find a good hook or function start. Inside ChartOfAccountsManager, let's search for "const filteredAccounts = useMemo"
const hookStart = content.indexOf(' const filteredAccounts = useMemo(');
if (hookStart === -1) {
  console.error("Could not find filteredAccounts useMemo in ChartOfAccountsManager.tsx");
  process.exit(1);
}

const customLogic = `  // Centrally computed category totals for KPIs and table footers (Phase 1 Fix)
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {
      asset: 0,
      liability: 0,
      equity: 0,
      revenue: 0,
      expense: 0
    };
    accounts.forEach(a => {
      if (a.type in totals) {
        totals[a.type] += Number(a.balance || 0);
      }
    });
    return totals;
  }, [accounts]);

  // Year-End Close Sweep Logic (Phase 2 Fix)
  async function handleYearEndClose() {
    if (confirm("Are you sure you want to perform a Year-End Close? This will close all revenue and expense accounts, close Owner's Drawings, and transfer the net balance to Owner's Capital. This action is irreversible.")) {
      const toastId = toast.loading("Performing Year-End Close...");
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const revenueAccs = accounts.filter(a => a.type === 'revenue' && Number(a.balance || 0) !== 0);
        const expenseAccs = accounts.filter(a => a.type === 'expense' && Number(a.balance || 0) !== 0);
        const drawingsAcc = accounts.find(a => a.type === 'equity' && a.name.toLowerCase().includes('drawings'));
        const capitalAcc = accounts.find(a => a.type === 'equity' && a.name.toLowerCase().includes('capital'));

        if (!capitalAcc) {
          throw new Error("Owner's Capital account not found. Please initialize default accounts first.");
        }

        const lines: JournalLineItem[] = [];

        // Sweeping Revenues: Debit each Revenue account by its balance (credit normal)
        let totalRevenue = 0;
        revenueAccs.forEach(a => {
          const bal = Number(a.balance || 0);
          if (bal > 0) {
            lines.push({ account_id: a.id, debit: bal, credit: 0 });
            totalRevenue += bal;
          }
        });

        // Sweeping Expenses: Credit each Expense account by its balance (debit normal)
        let totalExpenses = 0;
        expenseAccs.forEach(a => {
          const bal = Number(a.balance || 0);
          if (bal > 0) {
            lines.push({ account_id: a.id, debit: 0, credit: bal });
            totalExpenses += bal;
          }
        });

        // Sweeping Owner's Drawings: Credit Owner's Drawings by its balance (debit normal)
        let drawingsBal = 0;
        if (drawingsAcc) {
          drawingsBal = Number(drawingsAcc.balance || 0);
          if (drawingsBal > 0) {
            lines.push({ account_id: drawingsAcc.id, debit: 0, credit: drawingsBal });
          }
        }

        const netIncome = totalRevenue - totalExpenses;
        const capitalAdjustment = netIncome - drawingsBal;

        // Balancing figure goes to Owner's Capital
        if (capitalAdjustment > 0) {
          lines.push({ account_id: capitalAcc.id, debit: 0, credit: capitalAdjustment });
        } else if (capitalAdjustment < 0) {
          lines.push({ account_id: capitalAcc.id, debit: Math.abs(capitalAdjustment), credit: 0 });
        }

        if (lines.length === 0) {
          toast.success("All revenue, expense, and drawings accounts are already zero. No sweep needed.", { id: toastId });
          return;
        }

        const result = await createJournalEntryAtomic(supabase, {
          user_id: user.id,
          date: new Date().toISOString().split('T')[0],
          description: \`Year-End Close Sweep: Net Income of \${netIncome.toLocaleString()} PKR transferred to Owner's Capital, Drawings of \${drawingsBal.toLocaleString()} PKR closed.\`,
          lines,
          created_by_source: 'MANUAL',
          reference_type: 'YEAR_END_CLOSE'
        });

        if (result.error) throw new Error(result.error);

        toast.success("Year-End Close completed successfully! Books have been swept and drawings reset to 0.", { id: toastId });
        await fetchAccountsWithBalances();
      } catch (err: any) {
        toast.error(\`Year-End Close failed: \${err.message}\`, { id: toastId });
      }
    }
  }

`;

content = content.substring(0, hookStart) + customLogic + content.substring(hookStart);

// 4. Update top 5-category KPI cards to use categoryTotals instead of recalculating
const kpiOld = `            const catTotal = accounts
              .filter(a => a.type === cat.type)
              .reduce((sum, a) => sum + Number(a.balance || 0), 0);`;

const kpiNew = `            const catTotal = categoryTotals[cat.type];`;
content = content.replace(kpiOld, kpiNew);

// 5. Update table footers to use categoryTotals instead of group.items.reduce (State Synchronization)
const footerOld = `                    {group.items.reduce((sum, acc) => sum + Number(acc.balance || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const footerNew = `                    {categoryTotals[group.type].toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
content = content.replace(footerOld, footerNew);

// 6. Replace header buttons (Phase 5 / Phase 2 Close)
// Let's locate the button group
const headerButtonsOld = `<div className="flex flex-wrap gap-2">
           <button
             onClick={() => {
               const defaultBank = accounts.find(a => a.is_cash_account || a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash'));
               if (defaultBank) setReceiveLoanBankAccountId(defaultBank.id);
               const defaultLoan = accounts.find(a => a.type === 'liability' && (a.name.toLowerCase().includes('loan') || a.code?.startsWith('25')));
               if (defaultLoan) setReceiveLoanAccountId(defaultLoan.id);
               setIsReceiveLoanModalOpen(true);
             }}
             className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer"
           >
             <Landmark className="w-4 h-4" /> + Receive Loan
           </button>
           <button
             onClick={() => {
               const defaultLoan = accounts.find(a => a.type === 'liability' && (a.name.toLowerCase().includes('loan') || a.code?.startsWith('25')));
               if (defaultLoan) setLoanAccountId(defaultLoan.id);
               const defaultBank = accounts.find(a => a.is_cash_account || a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash'));
               if (defaultBank) setLoanPaymentAccountId(defaultBank.id);
               setIsLoanModalOpen(true);
             }}
             className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
           >
             <Receipt className="w-4 h-4" /> Record Loan Payment
           </button>`;

const headerButtonsNew = `<div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/debt"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Landmark className="w-4 h-4" /> Debt & Loans Hub →
          </Link>
          <button
            onClick={handleYearEndClose}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> ⚡ Year-End Close
          </button>`;

content = content.replace(headerButtonsOld, headerButtonsNew);

fs.writeFileSync(filePath, content, 'utf8');
console.log("✓ Patched ChartOfAccountsManager.tsx successfully!");
