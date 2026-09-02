import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

async function verifyPopulatedExports() {
  console.log("==================================================================");
  console.log("🚀 VERIFYING POPULATED EXPORT ENGINE (REAL TRANSACTION DATA)");
  console.log("==================================================================");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  const userId = authData.user.id;

  // 1. Fetch exactly as in /api/export/route.ts
  const [accountsRes, journalsRes, invoicesRes, billsRes, customersRes, suppliersRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('journal_entries').select('*, journal_lines(*, accounts(id, name, type, parent_account_id, parent_id))').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('invoices').select('*, customers(id, name, email, phone), invoice_lines(*, products(id, name, cost, price, is_inventory_tracked))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(id, name, type), products(id, name, cost, price))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('customers').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('suppliers').select('*').eq('user_id', userId).order('name', { ascending: true })
  ]);

  const accounts = accountsRes.data || [];
  const journalEntries = journalsRes.data || [];
  const invoices = invoicesRes.data || [];
  const bills = billsRes.data || [];
  const allCustomers = customersRes.data || [];
  const allSuppliers = suppliersRes.data || [];

  console.log(`\n📊 Data Query Verification:`);
  console.log(` - Accounts loaded: ${accounts.length}`);
  console.log(` - Journal Entries loaded: ${journalEntries.length}`);
  console.log(` - Invoices loaded: ${invoices.length}`);
  console.log(` - Bills loaded: ${bills.length}`);
  console.log(` - Customers loaded: ${allCustomers.length}`);
  console.log(` - Suppliers loaded: ${allSuppliers.length}`);

  if (journalEntries.length === 0 || invoices.length === 0 || bills.length === 0) {
    throw new Error("CRITICAL: Query returned 0 records for journals, invoices, or bills!");
  }

  // 2. Compute Account Balances
  const accountBalances = new Map();
  for (const acc of accounts) {
    accountBalances.set(acc.id, { debitsCents: 0, creditsCents: 0 });
  }

  let totalJournalLines = 0;
  for (const entry of journalEntries) {
    if (entry.journal_lines && Array.isArray(entry.journal_lines)) {
      for (const line of entry.journal_lines) {
        totalJournalLines++;
        const debitCents = Math.round(Number(line.debit || 0) * 100);
        const creditCents = Math.round(Number(line.credit || 0) * 100);
        let b = accountBalances.get(line.account_id);
        if (!b) {
          b = { debitsCents: 0, creditsCents: 0 };
          accountBalances.set(line.account_id, b);
        }
        b.debitsCents += debitCents;
        b.creditsCents += creditCents;
      }
    }
  }

  console.log(` - Total Journal Lines processed: ${totalJournalLines}`);

  // 3. Check General Ledger Row Population
  const glRows = [];
  const accountsMap = new Map();
  accounts.forEach(a => accountsMap.set(a.id, a));

  journalEntries.forEach(entry => {
    const entryDate = entry.date ? entry.date.split('T')[0] : '-';
    (entry.journal_lines || []).forEach(line => {
      const acc = line.accounts || accountsMap.get(line.account_id) || {};
      const parent = (acc.parent_account_id || acc.parent_id) ? accountsMap.get(acc.parent_account_id || acc.parent_id) : null;
      glRows.push({
        date: entryDate,
        desc: entry.description,
        account: acc.name,
        parent: parent ? parent.name : 'Primary Control',
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0)
      });
    });
  });

  console.log(`\n📋 General Ledger Verification:`);
  console.log(` -> Total General Ledger lines: ${glRows.length}`);
  console.log(` -> First 3 GL lines sample:`, glRows.slice(0, 3));

  if (glRows.length === 0) {
    throw new Error("CRITICAL: General Ledger is empty!");
  }

  // 4. Check Invoices & Invoice Line Items Population
  let totalInvoiceLines = 0;
  invoices.forEach(inv => {
    totalInvoiceLines += (inv.invoice_lines || []).length;
  });

  console.log(`\n🧾 Invoices Verification:`);
  console.log(` -> Total Invoices: ${invoices.length}`);
  console.log(` -> Total Detailed Invoice Line Items: ${totalInvoiceLines}`);

  // 5. Check Bills & Bill Line Items Population
  let totalBillLines = 0;
  bills.forEach(b => {
    totalBillLines += (b.bill_lines || []).length;
  });

  console.log(`\n📦 Bills Verification:`);
  console.log(` -> Total Bills: ${bills.length}`);
  console.log(` -> Total Detailed Bill Line Items: ${totalBillLines}`);

  // 6. Check Non-Zero Balances on Chart of Accounts
  let nonZeroAccounts = 0;
  accounts.forEach(acc => {
    const b = accountBalances.get(acc.id);
    if (b && (b.debitsCents > 0 || b.creditsCents > 0)) {
      nonZeroAccounts++;
    }
  });

  console.log(`\n📈 Financial Balance Verification:`);
  console.log(` -> Accounts with non-zero transactional activity: ${nonZeroAccounts} / ${accounts.length}`);

  if (nonZeroAccounts === 0) {
    throw new Error("CRITICAL: All accounts still have 0.00 debits/credits!");
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL TRANSACTION DATA SUCCESSFULLY POPULATED IN EXPORT ENGINE!");
  console.log("==================================================================");
}

verifyPopulatedExports().catch(err => {
  console.error("❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
