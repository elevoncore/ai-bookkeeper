import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testCorrectedQueries() {
  console.log("=== TESTING CORRECTED EXPORT QUERIES ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  const [accountsRes, journalsRes, invoicesRes, billsRes, customersRes, suppliersRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('journal_entries').select('*, journal_lines(*, accounts(id, name, type, parent_account_id, parent_id))').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('invoices').select('*, customers(id, name, email, phone), invoice_lines(*, products(id, name, cost, price, is_inventory_tracked))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(id, name, type), products(id, name, cost, price))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('customers').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('suppliers').select('*').eq('user_id', userId).order('name', { ascending: true })
  ]);

  console.log("Accounts error:", accountsRes.error?.message || "NONE", "| Count:", accountsRes.data?.length);
  console.log("Journals error:", journalsRes.error?.message || "NONE", "| Count:", journalsRes.data?.length);
  console.log("Invoices error:", invoicesRes.error?.message || "NONE", "| Count:", invoicesRes.data?.length);
  console.log("Bills error:", billsRes.error?.message || "NONE", "| Count:", billsRes.data?.length);
  console.log("Customers error:", customersRes.error?.message || "NONE", "| Count:", customersRes.data?.length);
  console.log("Suppliers error:", suppliersRes.error?.message || "NONE", "| Count:", suppliersRes.data?.length);

  if (journalsRes.data && journalsRes.data.length > 0) {
    let totalDebits = 0;
    let totalCredits = 0;
    journalsRes.data.forEach(j => {
      (j.journal_lines || []).forEach(l => {
        totalDebits += Number(l.debit || 0);
        totalCredits += Number(l.credit || 0);
      });
    });
    console.log(`\nVerified General Ledger Data:`);
    console.log(` -> Total Debits across all journal lines: ${totalDebits.toLocaleString()} PKR`);
    console.log(` -> Total Credits across all journal lines: ${totalCredits.toLocaleString()} PKR`);
    console.log(` -> Balanced Ledger Check: ${totalDebits === totalCredits ? 'PERFECTLY BALANCED' : 'UNBALANCED'}`);
  }

  if (invoicesRes.data && invoicesRes.data.length > 0) {
    let totalInv = 0;
    let lineItemCount = 0;
    invoicesRes.data.forEach(inv => {
      totalInv += Number(inv.total_amount || 0);
      lineItemCount += (inv.invoice_lines || []).length;
    });
    console.log(`\nVerified Invoices Data:`);
    console.log(` -> Total Invoiced: ${totalInv.toLocaleString()} PKR across ${invoicesRes.data.length} invoices`);
    console.log(` -> Total Invoice Line Items: ${lineItemCount}`);
  }
}

testCorrectedQueries().catch(console.error);
