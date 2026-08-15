import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: Request) {
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

    // Run initialization RPC for default chart of accounts
    const { error: rpcError } = await supabase.rpc('initialize_default_accounts', {
      p_user_id: user.id
    });

    // Ensure all standard system accounts exist (including Loan Payable & Interest Expense)
    const accountsToSeed = [
      { user_id: user.id, name: 'Main Bank Account', type: 'asset', is_system: true },
      { user_id: user.id, name: 'Petty Cash', type: 'asset', is_system: true },
      { user_id: user.id, name: 'Accounts Receivable', type: 'asset', is_system: true },
      { user_id: user.id, name: 'Inventory Asset', type: 'asset', is_system: true },
      { user_id: user.id, name: 'Accounts Payable', type: 'liability', is_system: true },
      { user_id: user.id, name: 'Loan Payable', type: 'liability', is_system: true },
      { user_id: user.id, name: 'Owners Equity', type: 'equity', is_system: true },
      { user_id: user.id, name: 'Sales Revenue', type: 'revenue', is_system: true },
      { user_id: user.id, name: 'Service Revenue', type: 'revenue', is_system: true },
      { user_id: user.id, name: 'Cost of Goods Sold', type: 'expense', is_system: true },
      { user_id: user.id, name: 'Rent Expense', type: 'expense', is_system: true },
      { user_id: user.id, name: 'Utilities', type: 'expense', is_system: true },
      { user_id: user.id, name: 'Software & Hosting', type: 'expense', is_system: true },
      { user_id: user.id, name: 'Interest Expense', type: 'expense', is_system: true },
      { user_id: user.id, name: 'General Operating Expense', type: 'expense', is_system: true }
    ];

    for (const acc of accountsToSeed) {
      const { data: existing } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', acc.name)
        .limit(1);
        
      if (!existing || existing.length === 0) {
        await supabase.from('accounts').insert(acc);
      }
    }

    // Fetch and return complete chart of accounts for user
    const { data: accounts, error: fetchError } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('type', { ascending: true })
      .order('name', { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      count: accounts?.length || 0,
      accounts 
    });
  } catch (error: any) {
    console.error("Error in /api/accounts/initialize:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
