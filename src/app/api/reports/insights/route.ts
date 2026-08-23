import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

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

 // 1. Fetch Accounts
 const { data: accounts } = await supabase
 .from('accounts')
 .select('id, name, type, is_cash_account')
 .eq('user_id', user.id);

 // 2. Fetch Journal Lines for user
 const { data: journalLines } = await supabase
 .from('journal_lines')
 .select('account_id, debit, credit, journal_entries!inner(user_id, date)')
 .eq('journal_entries.user_id', user.id);

 // 3. Fetch Invoices & Bills
 const { data: invoices } = await supabase
 .from('invoices')
 .select('total_amount, status, is_ai_verified')
 .eq('user_id', user.id);

 const { data: bills } = await supabase
 .from('bills')
 .select('total_amount, status, is_ai_verified')
 .eq('user_id', user.id);

 // Calculate aggregated financial metrics
 let totalRevenue = 0;
 let totalExpenses = 0;
 let totalLiquidCash = 0;
 let accountsReceivable = 0;
 let accountsPayable = 0;

 const accountMap = new Map<string, { name: string; type: string; is_cash: boolean }>();
 if (accounts) {
 for (const a of accounts) {
 accountMap.set(a.id, { name: a.name, type: a.type, is_cash: Boolean(a.is_cash_account) });
 }
 }

 const accountBalances = new Map<string, number>();

 if (journalLines) {
 for (const line of journalLines) {
 const info = accountMap.get(line.account_id);
 const debit = Number(line.debit || 0);
 const credit = Number(line.credit || 0);

 if (info) {
 if (info.type === 'revenue') {
 totalRevenue += (credit - debit);
 } else if (info.type === 'expense') {
 totalExpenses += (debit - credit);
 }

 let net = 0;
 if (info.type === 'asset' || info.type === 'expense') net = debit - credit;
 else net = credit - debit;

 const current = accountBalances.get(line.account_id) || 0;
 accountBalances.set(line.account_id, current + net);

 if (info.is_cash) {
 totalLiquidCash += (debit - credit);
 }
 if (info.name === 'Accounts Receivable') {
 accountsReceivable += (debit - credit);
 }
 if (info.name === 'Accounts Payable') {
 accountsPayable += (credit - debit);
 }
 }
 }
 }

 const netIncome = totalRevenue - totalExpenses;
 const profitMarginPct = totalRevenue > 0 ? Math.round((netIncome / totalRevenue) * 100) : 0;

 const financialSummaryJSON = {
 total_revenue_pkr: totalRevenue,
 total_expenses_pkr: totalExpenses,
 net_income_pkr: netIncome,
 profit_margin_pct: profitMarginPct,
 liquid_cash_pkr: totalLiquidCash,
 accounts_receivable_pkr: accountsReceivable,
 accounts_payable_pkr: accountsPayable,
 verified_invoices_count: invoices?.filter(i => i.is_ai_verified).length || 0,
 verified_bills_count: bills?.filter(b => b.is_ai_verified).length || 0
 };

 let insights: string[] = [];

 // Try Gemini AI CFO generation if API key is present
 if (process.env.GEMINI_API_KEY) {
 try {
 const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
 const insightsSchema = {
 type: SchemaType.OBJECT,
 properties: {
 insights: {
 type: SchemaType.ARRAY,
 description: "Exactly 3 CFO business insights",
 items: { type: SchemaType.STRING }
 }
 },
 required: ["insights"]
 } as const;

 const model = genAI.getGenerativeModel({
 model: "gemini-3.5-flash-lite",
 generationConfig: {
 responseMimeType: "application/json",
 responseSchema: insightsSchema as any,
 temperature: 0.2
 }
 });

 const prompt = `You are a Chief Financial Officer (CFO). Analyze this JSON financial data:
${JSON.stringify(financialSummaryJSON, null, 2)}

Provide exactly 3 short, punchy bullet points of business insights. Highlight anomalies (e.g. high operating expenses), cash flow warnings (e.g. low liquid reserves vs payables), or revenue wins.`;

 const result = await model.generateContent(prompt);
 const text = result.response.text();
 const parsed = JSON.parse(text);
 if (Array.isArray(parsed.insights) && parsed.insights.length >= 3) {
 insights = parsed.insights.slice(0, 3);
 }
 } catch (geminiErr) {
 console.error("Gemini Insights generation failed, falling back to CFO rules:", geminiErr);
 }
 }

 // High Quality Rule-Based CFO Fallback if AI generation fails or key is missing
 if (insights.length < 3) {
 insights = [];
 
 // Insight 1: Revenue & Profitability
 if (totalRevenue > 0) {
 insights.push(`🎯 Strong Revenue Momentum: Generated ${totalRevenue.toLocaleString()} PKR in revenue with a ${profitMarginPct}% net profit margin (${netIncome.toLocaleString()} PKR net income).`);
 } else {
 insights.push(`⚠️ Revenue Growth Opportunity: Total recognized revenue is currently 0 PKR. Staging billing entries will immediately compute gross profit metrics.`);
 }

 // Insight 2: Cash Flow & Liquidity Warning
 if (accountsPayable > totalLiquidCash && accountsPayable > 0) {
 insights.push(`⚡ Cash Flow Warning: Outstanding Accounts Payable (${accountsPayable.toLocaleString()} PKR) exceeds available liquid cash reserves (${totalLiquidCash.toLocaleString()} PKR). Prioritize receivables collection.`);
 } else if (totalLiquidCash > 0) {
 insights.push(`💡 Liquidity Reserve: Maintains ${totalLiquidCash.toLocaleString()} PKR in liquid cash reserves, comfortably covering short-term operating obligations.`);
 } else {
 insights.push(`💡 Liquidity Baseline: Liquid cash accounts are balanced at 0 PKR. Logging incoming customer payments will update working capital ratios.`);
 }

 // Insight 3: Expense Anomaly / Working Capital Optimization
 if (accountsReceivable > 0) {
 insights.push(`📈 Working Capital Efficiency: ${accountsReceivable.toLocaleString()} PKR remains uncollected in Accounts Receivable. Expediting customer invoicing will accelerate cash flow velocity.`);
 } else if (totalExpenses > totalRevenue) {
 insights.push(`🔥 Operating Expense Anomaly: Total expenses (${totalExpenses.toLocaleString()} PKR) currently exceed revenue (${totalRevenue.toLocaleString()} PKR). Review cost of goods sold and overhead spending.`);
 } else {
 insights.push(`📊 Expense Ratio Balanced: Operating overhead (${totalExpenses.toLocaleString()} PKR) is strictly aligned with recognized gross margins.`);
 }
 }

 return NextResponse.json({
 success: true,
 currency: "PKR",
 summary: financialSummaryJSON,
 insights
 }, { status: 200 });

 } catch (err: any) {
 console.error("API Error in /api/reports/insights:", err);
 return NextResponse.json({ error: err.message }, { status: 500 });
 }
}
