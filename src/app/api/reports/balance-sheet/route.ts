import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

    // Ensure default chart of accounts exist
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    // 1. Fetch Accounts
    const { data: accounts, error: accErr } = await supabase
      .from('accounts')
      .select('id, name, type, is_system, is_cash_account')
      .eq('user_id', user.id);

    if (accErr || !accounts) {
      return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }

    // 2. Fetch Journal Lines for user
    const { data: journalLines, error: jlError } = await supabase
      .from('journal_lines')
      .select('account_id, debit, credit, journal_entries!inner(user_id)')
      .eq('journal_entries.user_id', user.id);

    if (jlError) {
      console.error("Journal lines error:", jlError);
      return NextResponse.json({ error: "Failed to fetch ledger lines" }, { status: 500 });
    }

    // Aggregate debits & credits per account in cents
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

    // Balance Sheet Categories
    let totalAssetCents = 0;
    let totalLiabilityCents = 0;
    let contributedEquityCents = 0;
    let totalRevenueCents = 0;
    let totalExpenseCents = 0;

    const assetAccounts: any[] = [];
    const liabilityAccounts: any[] = [];
    const equityAccounts: any[] = [];

    for (const acc of accounts) {
      const b = accountBalances.get(acc.id) || { debits: 0, credits: 0 };
      const debits = b.debits;
      const credits = b.credits;

      if (acc.type === 'asset') {
        const netCents = debits - credits;
        totalAssetCents += netCents;
        assetAccounts.push({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          is_cash_account: Boolean(acc.is_cash_account),
          balance: netCents / 100
        });
      } else if (acc.type === 'liability') {
        const netCents = credits - debits;
        totalLiabilityCents += netCents;
        liabilityAccounts.push({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          balance: netCents / 100
        });
      } else if (acc.type === 'equity') {
        const netCents = credits - debits;
        contributedEquityCents += netCents;
        equityAccounts.push({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          balance: netCents / 100
        });
      } else if (acc.type === 'revenue') {
        totalRevenueCents += (credits - debits);
      } else if (acc.type === 'expense') {
        totalExpenseCents += (debits - credits);
      }
    }

    // Net Income calculation
    const netIncomeCents = totalRevenueCents - totalExpenseCents;
    const netIncome = netIncomeCents / 100;

    // Append Net Income line item into Equity section
    equityAccounts.push({
      id: 'net_income_current_period',
      name: 'Net Income (Current Period)',
      type: 'equity',
      is_net_income: true,
      balance: netIncome
    });

    const totalEquityCents = contributedEquityCents + netIncomeCents;
    const totalLiabilitiesAndEquityCents = totalLiabilityCents + totalEquityCents;

    // Mathematical verification check: Assets === Liabilities + Equity
    const isBalanced = totalAssetCents === totalLiabilitiesAndEquityCents;

    return NextResponse.json({
      success: true,
      currency: "PKR",
      as_of_date: new Date().toISOString().split('T')[0],
      is_balanced: isBalanced,
      totals: {
        total_assets: totalAssetCents / 100,
        total_liabilities: totalLiabilityCents / 100,
        contributed_equity: contributedEquityCents / 100,
        net_income: netIncome,
        total_equity: totalEquityCents / 100,
        total_liabilities_and_equity: totalLiabilitiesAndEquityCents / 100
      },
      assets: assetAccounts,
      liabilities: liabilityAccounts,
      equity: equityAccounts
    }, { status: 200 });

  } catch (err: any) {
    console.error("API Error in /api/reports/balance-sheet:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
