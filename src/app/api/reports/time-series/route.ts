import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
 try {
 const { searchParams } = new URL(request.url);
 const timeframe = searchParams.get("timeframe") || "monthly"; // 'daily' | 'weekly' | 'monthly'
 const range = searchParams.get("range") || "all"; // '7d' | '30d' | 'ytd' | 'all'

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
 const { data: accounts, error: accErr } = await supabase
 .from('accounts')
 .select('id, name, type, is_cash_account')
 .eq('user_id', user.id);

 if (accErr || !accounts) {
 return NextResponse.json({ error: "Failed to fetch accounts" }, { status: 500 });
 }

 const accountMap = new Map<string, { type: string; is_cash: boolean }>();
 for (const acc of accounts) {
 accountMap.set(acc.id, { type: acc.type, is_cash: Boolean(acc.is_cash_account) });
 }

 // Determine cutoff date for range filter
 const now = new Date();
 let cutoffDateStr: string | null = null;
 if (range === '7d') {
 const d = new Date();
 d.setDate(d.getDate() - 7);
 cutoffDateStr = d.toISOString().split('T')[0];
 } else if (range === '30d') {
 const d = new Date();
 d.setDate(d.getDate() - 30);
 cutoffDateStr = d.toISOString().split('T')[0];
 } else if (range === 'ytd') {
 cutoffDateStr = `${now.getFullYear()}-01-01`;
 }

 // 2. Query Journal Lines with date
 let query = supabase
 .from('journal_lines')
 .select('account_id, debit, credit, journal_entries!inner(user_id, date)')
 .eq('journal_entries.user_id', user.id);

 if (cutoffDateStr) {
 query = query.gte('journal_entries.date', cutoffDateStr);
 }

 const { data: journalLines, error: jlError } = await query;

 if (jlError) {
 console.error("Time-series fetch error:", jlError);
 return NextResponse.json({ error: "Failed to fetch time-series lines" }, { status: 500 });
 }

 // Bucket aggregation map
 // Bucket key -> { bucketLabel, revenue, expenses, cash_in, cash_out }
 const bucketsMap = new Map<string, {
 bucketLabel: string;
 sortKey: string;
 revenueCents: number;
 expensesCents: number;
 cashInCents: number;
 cashOutCents: number;
 }>();

 function getBucketKeyAndLabel(dateStr: string): { key: string; label: string } {
 const d = new Date(dateStr);
 if (isNaN(d.getTime())) return { key: 'Unknown', label: 'Unknown' };

 if (timeframe === 'daily') {
 const key = dateStr; // YYYY-MM-DD
 const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
 return { key, label };
 } else if (timeframe === 'weekly') {
 // Calculate week number or start of week (Sunday/Monday)
 const day = d.getDay();
 const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
 const startOfWeek = new Date(d.setDate(diffToMonday));
 const key = startOfWeek.toISOString().split('T')[0];
 const label = `Wk ${startOfWeek.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}`;
 return { key, label };
 } else {
 // Monthly
 const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
 const key = `${d.getFullYear()}-${monthNum}`;
 const label = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
 return { key, label };
 }
 }

 if (journalLines) {
 for (const line of journalLines) {
 const entryDate = (line.journal_entries as any)?.date || now.toISOString().split('T')[0];
 const { key, label } = getBucketKeyAndLabel(entryDate);

 if (!bucketsMap.has(key)) {
 bucketsMap.set(key, {
 bucketLabel: label,
 sortKey: key,
 revenueCents: 0,
 expensesCents: 0,
 cashInCents: 0,
 cashOutCents: 0
 });
 }

 const bucket = bucketsMap.get(key)!;
 const accInfo = accountMap.get(line.account_id);
 const debitCents = Math.round(Number(line.debit || 0) * 100);
 const creditCents = Math.round(Number(line.credit || 0) * 100);

 if (accInfo) {
 if (accInfo.type === 'revenue') {
 bucket.revenueCents += (creditCents - debitCents);
 } else if (accInfo.type === 'expense') {
 bucket.expensesCents += (debitCents - creditCents);
 }

 if (accInfo.is_cash) {
 bucket.cashInCents += debitCents;
 bucket.cashOutCents += creditCents;
 }
 }
 }
 }

 // Sort buckets chronologically by sortKey
 const sortedBuckets = Array.from(bucketsMap.values()).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

 const series = sortedBuckets.map(b => {
 const revenue = b.revenueCents / 100;
 const expenses = b.expensesCents / 100;
 const net_profit = (b.revenueCents - b.expensesCents) / 100;
 const cash_in = b.cashInCents / 100;
 const cash_out = b.cashOutCents / 100;
 const net_cash_flow = (b.cashInCents - b.cashOutCents) / 100;

 return {
 bucket: b.bucketLabel,
 sort_key: b.sortKey,
 revenue,
 expenses,
 net_profit,
 cash_in,
 cash_out,
 net_cash_flow
 };
 });

 return NextResponse.json({
 success: true,
 timeframe,
 range,
 count: series.length,
 series
 }, { status: 200 });

 } catch (err: any) {
 console.error("API Error in /api/reports/time-series:", err);
 return NextResponse.json({ error: err.message }, { status: 500 });
 }
}
