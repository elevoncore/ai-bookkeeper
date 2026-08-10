import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch Accounts
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, type')
      .eq('user_id', user.id);
      
    if (!accounts) {
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }

    // 2. Fetch all Journal Lines for the user via inner join on journal_entries
    const { data: journalLines, error: jlError } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(user_id, date)')
      .eq('journal_entries.user_id', user.id);

    if (jlError) {
      console.error("Journal lines fetch error:", jlError);
      return NextResponse.json({ error: "Failed to fetch ledger data" }, { status: 500 });
    }

    // Aggregation maps (in cents to prevent floating point inaccuracies)
    const accountBalances = new Map<string, { debits: number, credits: number }>();
    
    for (const acc of accounts) {
       accountBalances.set(acc.id, { debits: 0, credits: 0 });
    }

    if (journalLines) {
      for (const line of journalLines) {
        const debitCents = Math.round(Number(line.debit || 0) * 100);
        const creditCents = Math.round(Number(line.credit || 0) * 100);
        const current = accountBalances.get(line.account_id) || { debits: 0, credits: 0 };
        current.debits += debitCents;
        current.credits += creditCents;
        accountBalances.set(line.account_id, current);
      }
    }

    // Trial Balance Array
    const trialBalance = [];
    let totalDebitsCents = 0;
    let totalCreditsCents = 0;

    let revenueCents = 0;
    let cogsCents = 0;
    let operatingExpensesCents = 0;

    const revenueAccounts = [];
    const expenseAccounts = [];

    for (const acc of accounts) {
       const balanceObj = accountBalances.get(acc.id)!;
       const d = balanceObj.debits;
       const c = balanceObj.credits;
       totalDebitsCents += d;
       totalCreditsCents += c;

       let balance = 0;
       if (acc.type === 'asset' || acc.type === 'expense') {
          balance = d - c;
       } else {
          balance = c - d;
       }

       if (d > 0 || c > 0 || balance !== 0) {
          trialBalance.push({
             id: acc.id,
             name: acc.name,
             type: acc.type,
             debits: d / 100,
             credits: c / 100,
             balance: balance / 100
          });
       }

       if (acc.type === 'revenue') {
          revenueCents += (c - d);
          revenueAccounts.push({ name: acc.name, balance: (c - d) / 100 });
       }
       if (acc.type === 'expense') {
          const expBalance = d - c;
          if (acc.name === 'Cost of Goods Sold') {
             cogsCents += expBalance;
          } else {
             operatingExpensesCents += expBalance;
             expenseAccounts.push({ name: acc.name, balance: expBalance / 100 });
          }
       }
    }

    const grossProfitCents = revenueCents - cogsCents;
    const netProfitCents = grossProfitCents - operatingExpensesCents;

    return NextResponse.json({
       trial_balance: trialBalance,
       total_debits: totalDebitsCents / 100,
       total_credits: totalCreditsCents / 100,
       profit_and_loss: {
          revenue: revenueCents / 100,
          revenue_accounts: revenueAccounts,
          cogs: cogsCents / 100,
          gross_profit: grossProfitCents / 100,
          operating_expenses: operatingExpensesCents / 100,
          operating_expense_accounts: expenseAccounts,
          net_profit: netProfitCents / 100
       }
    }, { status: 200 });

  } catch (err: any) {
    console.error("API Error in /api/reports/financials:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
