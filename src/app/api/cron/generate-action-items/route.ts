import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGeminiCfoModel } from "@/lib/gemini";

export async function GET(request: Request) {
  return handleGenerateActionItems(request);
}

export async function POST(request: Request) {
  return handleGenerateActionItems(request);
}

async function handleGenerateActionItems(request: Request) {
  try {
    // 1. Security Authorization Check
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const isAuthorized = 
        authHeader === `Bearer ${cronSecret}` || 
        request.headers.get("x-cron-secret") === cronSecret ||
        request.headers.get("x-vercel-cron") === cronSecret;

      if (!isAuthorized) {
        console.warn("[Action Items Cron API] Unauthorized execution attempt.");
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Fetch Active Users
    const { data: accountsData } = await supabase.from('accounts').select('user_id').limit(100);
    const userIds = Array.from(new Set((accountsData || []).map(a => a.user_id).filter(Boolean)));

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, message: "No active users found.", generatedCount: 0 });
    }

    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let totalActionItemsInserted = 0;

    for (const userId of userIds) {
      // 3. Pull 30-day financial snapshots
      const [invoicesRes, billsRes, journalsRes, accountsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, total_amount, balance_due, amount_paid, status, issue_date, due_date, customers(name)')
          .eq('user_id', userId)
          .gte('issue_date', thirtyDaysAgo),
        supabase
          .from('bills')
          .select('id, total_amount, balance_due, amount_paid, status, issue_date, due_date, suppliers(name)')
          .eq('user_id', userId)
          .gte('issue_date', thirtyDaysAgo),
        supabase
          .from('journal_entries')
          .select('id, date, description, journal_lines(debit, credit, account_id, accounts(name, type, is_cash_account))')
          .eq('user_id', userId)
          .gte('date', `${thirtyDaysAgo} 00:00:00`),
        supabase
          .from('accounts')
          .select('id, name, type, is_cash_account, parent_account_id, parent_id')
          .eq('user_id', userId)
      ]);

      const invoices = invoicesRes.data || [];
      const bills = billsRes.data || [];
      const journals = journalsRes.data || [];
      const accounts = accountsRes.data || [];

      // Calculate key financial heuristics
      const openInvoices = invoices.filter(i => i.status !== 'paid' && Number(i.balance_due || 0) > 0);
      const totalAR = openInvoices.reduce((s, i) => s + Number(i.balance_due || 0), 0);

      const openBills = bills.filter(b => b.status !== 'paid' && Number(b.balance_due || 0) > 0);
      const totalAP = openBills.reduce((s, b) => s + Number(b.balance_due || 0), 0);

      const cashAccounts = accounts.filter(a => a.type === 'asset' && (a.is_cash_account || a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash')));
      
      let liquidCash = 0;
      journals.forEach(j => {
        (j.journal_lines || []).forEach((l: any) => {
          const acc = Array.isArray(l.accounts) ? l.accounts[0] : l.accounts;
          if (acc?.is_cash_account || (acc?.type === 'asset' && (acc?.name?.toLowerCase().includes('bank') || acc?.name?.toLowerCase().includes('cash')))) {
            liquidCash += (Number(l.debit || 0) - Number(l.credit || 0));
          }
        });
      });

      // Prepare context for Gemini CFO prompt
      const contextSummary = {
        liquid_cash_reserves_pkr: liquidCash,
        accounts_payable_owed_pkr: totalAP,
        accounts_receivable_owed_pkr: totalAR,
        open_invoices_count: openInvoices.length,
        open_bills_count: openBills.length,
        total_30day_invoices_count: invoices.length,
        total_30day_bills_count: bills.length
      };

      let actionItemsToInsert: any[] = [];

      try {
        const cfoModel = getGeminiCfoModel();
        const prompt = `Analyze the following 30-day financial performance metrics for an SME and produce high-priority CFO action items:
${JSON.stringify(contextSummary, null, 2)}

Enforce these exact CFO heuristics:
1. Liquidity Risk: If liquid cash (${liquidCash}) is less than accounts payable (${totalAP}), create a HIGH severity action item.
2. Collection Risk: If open receivables (${totalAR}) is greater than 0, create a HIGH or MEDIUM severity action item targeting overdue invoices.
3. Expense / Accounts Payable Management: If open bills (${totalAP}) exist, create an action item to schedule vendor payments.
4. Capital Reserves: If liquid cash is healthy, suggest optimizing operating capital.

Every item MUST have:
- severity: "high" | "medium" | "low"
- headline: Max 6 words (e.g. "Severe Aging Receivables Detected")
- description: 1-2 sentence executive explanation
- action_label: Button text (e.g. "Review Overdue Invoices", "Manage Vendor Bills", "Review Cash Flow")
- action_route: Path string (e.g. "/dashboard?tab=invoices", "/dashboard?tab=bills", "/dashboard?tab=cashbook")`;

        const result = await cfoModel.generateContent(prompt);
        const text = result.response.text();
        const parsed = JSON.parse(text);

        if (Array.isArray(parsed)) {
          actionItemsToInsert = parsed;
        }
      } catch (geminiErr) {
        console.warn("[Action Items Cron API] Gemini AI fallback activated:", geminiErr);
      }

      // Fallback heuristics if Gemini fails or returns empty
      if (actionItemsToInsert.length === 0) {
        if (liquidCash < totalAP && totalAP > 0) {
          actionItemsToInsert.push({
            severity: "high",
            headline: "Severe Liquidity Risk Detected",
            description: `Liquid cash reserves (${liquidCash.toLocaleString()} PKR) are lower than pending vendor payables (${totalAP.toLocaleString()} PKR).`,
            action_label: "Review Vendor Bills",
            action_route: "/dashboard?tab=bills"
          });
        }
        if (totalAR > 0) {
          actionItemsToInsert.push({
            severity: "high",
            headline: "Severe Aging Receivables Detected",
            description: `You have ${openInvoices.length} outstanding invoice(s) totaling ${totalAR.toLocaleString()} PKR awaiting customer payment.`,
            action_label: "Review Overdue Invoices",
            action_route: "/dashboard?tab=invoices"
          });
        }
        if (openBills.length > 0) {
          actionItemsToInsert.push({
            severity: "medium",
            headline: "Pending Vendor Obligations",
            description: `${openBills.length} unpaid bill(s) totaling ${totalAP.toLocaleString()} PKR require payment scheduling.`,
            action_label: "Manage Vendor Bills",
            action_route: "/dashboard?tab=bills"
          });
        }
      }

      // Insert action items into database for the user
      for (const item of actionItemsToInsert) {
        const { error: insertErr } = await supabase.from('ai_action_items').insert({
          user_id: userId,
          severity: item.severity || 'medium',
          headline: (item.headline || 'Financial Action Required').substring(0, 255),
          description: item.description || '',
          action_label: item.action_label || 'View Details',
          action_route: item.action_route || '/dashboard',
          is_resolved: false
        });

        if (!insertErr) {
          totalActionItemsInserted++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      usersProcessed: userIds.length,
      insertedCount: totalActionItemsInserted
    }, { status: 200 });

  } catch (error: any) {
    console.error("[Action Items Cron Fatal Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
