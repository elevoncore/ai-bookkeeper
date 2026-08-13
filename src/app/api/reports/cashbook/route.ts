import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { parseToCents } from "@/utils/currency";

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure accounts are initialized
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    // Target accounts
    const targetAccountNames = ['Main Bank Account', 'Petty Cash'];

    // Fetch accounts
    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('id, name, type, is_system')
      .eq('user_id', user.id)
      .in('name', targetAccountNames);

    if (accError) {
      console.error("Error fetching cashbook accounts:", accError);
      return NextResponse.json({ error: accError.message }, { status: 500 });
    }

    const accountIds = (accounts || []).map(a => a.id);

    // Fetch journal lines for these accounts
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

    // Build structured cashbook balances
    let mainBankBalance = 0;
    let pettyCashBalance = 0;
    let totalCashCents = 0;

    const accountBalances = targetAccountNames.map(name => {
      const matched = (accounts || []).find(a => a.name.toLowerCase() === name.toLowerCase());
      if (!matched) {
        return {
          id: null,
          name,
          type: 'asset',
          balance: 0,
          debit_total: 0,
          credit_total: 0
        };
      }

      const totals = linesMap[matched.id] || { debitCents: 0, creditCents: 0 };
      const balanceCents = totals.debitCents - totals.creditCents;
      const balance = balanceCents / 100;
      totalCashCents += balanceCents;

      if (name === 'Main Bank Account') {
        mainBankBalance = balance;
      } else if (name === 'Petty Cash') {
        pettyCashBalance = balance;
      }

      return {
        id: matched.id,
        name: matched.name,
        type: matched.type,
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
      accounts: accountBalances
    });

  } catch (error: any) {
    console.error("Error in /api/reports/cashbook:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
