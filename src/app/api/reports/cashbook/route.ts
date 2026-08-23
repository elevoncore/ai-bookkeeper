import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseToCents } from "@/utils/currency";

export async function GET(request: Request) {
 try {
    const cookieStore = await cookies();
    let supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    let user = null;
    const { data: cookieAuthData } = await supabase.auth.getUser();
    user = cookieAuthData?.user;

    // Fallback for Bearer token in Authorization header
    if (!user) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: {
              headers: { Authorization: authHeader }
            },
            cookies: {
              getAll() { return cookieStore.getAll(); },
              setAll() {}
            }
          }
        );
        const { data: tokenAuthData } = await supabase.auth.getUser();
        user = tokenAuthData?.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

 // Ensure default accounts are initialized
 await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

 // Fetch accounts - try with is_cash_account column first
 let accountsData: any[] = [];
 const { data: accWithCash, error: cashErr } = await supabase
 .from('accounts')
 .select('id, name, type, is_system, is_cash_account')
 .eq('user_id', user.id);

 if (!cashErr && accWithCash) {
 accountsData = accWithCash;
 } else {
 // Fallback query without is_cash_account column
 const { data: stdAcc, error: stdErr } = await supabase
 .from('accounts')
 .select('id, name, type, is_system')
 .eq('user_id', user.id);

 if (stdErr) {
 console.error("Error fetching cashbook accounts:", stdErr);
 return NextResponse.json({ error: stdErr.message }, { status: 500 });
 }
 accountsData = stdAcc || [];
 }

 // Filter dynamic cash & bank accounts
 const cashAccounts = accountsData.filter(a => {
 if (a.type !== 'asset') return false;
 if (a.is_cash_account === true) return true;
 const lowerName = a.name.toLowerCase();
 return lowerName === 'main bank account' || 
 lowerName === 'petty cash' || 
 lowerName.includes('bank') || 
 lowerName.includes('cash') || 
 lowerName.includes('wallet') || 
 lowerName.includes('nayapay') || 
 lowerName.includes('easypaisa') || 
 lowerName.includes('sadapay');
 });

 const accountIds = cashAccounts.map(a => a.id);

 // Aggregate real-time balances from journal_lines
 let linesMap: Record<string, { debitCents: number; creditCents: number }> = {};
 accountIds.forEach(id => {
 linesMap[id] = { debitCents: 0, creditCents: 0 };
 });

 if (accountIds.length > 0) {
 const { data: lines, error: linesError } = await supabase
 .from('journal_lines')
 .select('account_id, debit, credit')
 .in('account_id', accountIds);

 if (!linesError && lines) {
 lines.forEach(line => {
 const accId = line.account_id;
 if (linesMap[accId]) {
 linesMap[accId].debitCents += parseToCents(line.debit || 0);
 linesMap[accId].creditCents += parseToCents(line.credit || 0);
 }
 });
 }
 }

 // Build dynamic structured balances
 let totalCashCents = 0;
 let mainBankBalance = 0;
 let pettyCashBalance = 0;

 const formattedAccounts = cashAccounts.map(acc => {
 const totals = linesMap[acc.id] || { debitCents: 0, creditCents: 0 };
 const balanceCents = totals.debitCents - totals.creditCents;
 const balance = balanceCents / 100;
 totalCashCents += balanceCents;

 if (acc.name === 'Main Bank Account') mainBankBalance = balance;
 if (acc.name === 'Petty Cash') pettyCashBalance = balance;

 return {
 id: acc.id,
 name: acc.name,
 type: acc.type,
 is_cash_account: true,
 balance,
 debit_total: totals.debitCents / 100,
 credit_total: totals.creditCents / 100
 };
 });

 return NextResponse.json({
 success: true,
 currency: 'PKR',
 mainBankBalance,
 pettyCashBalance,
 totalCashBalance: totalCashCents / 100,
 accounts: formattedAccounts
 });

 } catch (error: any) {
 console.error("Error in /api/reports/cashbook:", error);
 return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
 }
}
