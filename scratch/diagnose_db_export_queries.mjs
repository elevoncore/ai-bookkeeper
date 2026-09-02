import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function diagnose() {
  console.log("=== DIAGNOSING DATABASE EXPORT QUERIES ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;
  console.log(`User ID: ${userId}`);

  // 1. Check raw tables
  const { count: jCount, data: jRaw } = await supabase.from('journal_entries').select('*', { count: 'exact' }).eq('user_id', userId);
  const { count: jlCount, data: jlRaw } = await supabase.from('journal_lines').select('*', { count: 'exact' });
  const { count: invCount, data: invRaw } = await supabase.from('invoices').select('*', { count: 'exact' }).eq('user_id', userId);
  const { count: billCount, data: billRaw } = await supabase.from('bills').select('*', { count: 'exact' }).eq('user_id', userId);
  const { count: accCount, data: accRaw } = await supabase.from('accounts').select('*', { count: 'exact' }).eq('user_id', userId);

  console.log(`Raw Counts for user:`);
  console.log(` - journal_entries: ${jCount}`);
  console.log(` - journal_lines (all): ${jlCount}`);
  console.log(` - invoices: ${invCount}`);
  console.log(` - bills: ${billCount}`);
  console.log(` - accounts: ${accCount}`);

  // If user has no journal entries / invoices, let's also check other users or all users in DB
  const { data: allUsersEntries } = await supabase.from('journal_entries').select('user_id', { count: 'exact' });
  console.log(`Total journal_entries across ALL users: ${allUsersEntries?.length}`);
  const { data: allInvoices } = await supabase.from('invoices').select('user_id', { count: 'exact' });
  console.log(`Total invoices across ALL users: ${allInvoices?.length}`);
  const { data: allBills } = await supabase.from('bills').select('user_id', { count: 'exact' });
  console.log(`Total bills across ALL users: ${allBills?.length}`);

  // Test the EXACT queries used in /api/export/route.ts
  console.log("\nTesting EXACT queries from /api/export/route.ts:");
  
  // Invoices query
  const invQuery = await supabase
    .from('invoices')
    .select('*, customers(id, name, email, phone), invoice_lines(*, accounts(name, type), products(id, name, cost, price, is_inventory_tracked))')
    .eq('user_id', userId)
    .order('issue_date', { ascending: false });
  console.log("Invoices query error:", invQuery.error?.message || "None");
  console.log("Invoices query count:", invQuery.data?.length);

  // Bills query
  const billsQuery = await supabase
    .from('bills')
    .select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(name, type), products(id, name, cost, price))')
    .eq('user_id', userId)
    .order('issue_date', { ascending: false });
  console.log("Bills query error:", billsQuery.error?.message || "None");
  console.log("Bills query count:", billsQuery.data?.length);
  if (billsQuery.data && billsQuery.data.length > 0) {
    console.log("First bill:", JSON.stringify(billsQuery.data[0], null, 2));
  }

  // Journal Entries query
  const jnlQuery = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*, accounts(id, name, type, code, parent_account_id, parent_id))')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  console.log("Journal query error:", jnlQuery.error?.message || "None");
  console.log("Journal query count:", jnlQuery.data?.length);
  if (jnlQuery.error) {
    console.error("JOURNAL QUERY ERROR DETAILS:", jnlQuery.error);
  }
}

diagnose().catch(console.error);
