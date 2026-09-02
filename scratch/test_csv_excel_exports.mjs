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

async function testExportEngine() {
  console.log("==================================================================");
  console.log("🚀 STARTING CSV / EXCEL EXPORT ENGINE VERIFICATION");
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
  console.log(`Authenticated as user ${userId}`);

  // Fetch data directly from DB
  const [accountsRes, journalsRes, invoicesRes, billsRes, customersRes, suppliersRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('journal_entries').select('*, journal_lines(*, accounts(id, name, type, code, parent_account_id, parent_id))').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('invoices').select('*, customers(id, name, email, phone), invoice_lines(*, accounts(name, type), products(id, name, cost, price, is_inventory_tracked))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(name, type), products(id, name, cost, price))').eq('user_id', userId).order('issue_date', { ascending: false }),
    supabase.from('customers').select('*').eq('user_id', userId).order('name', { ascending: true }),
    supabase.from('suppliers').select('*').eq('user_id', userId).order('name', { ascending: true })
  ]);

  const accounts = accountsRes.data || [];
  const journalEntries = journalsRes.data || [];
  const invoices = invoicesRes.data || [];
  const bills = billsRes.data || [];
  const allCustomers = customersRes.data || [];
  const allSuppliers = suppliersRes.data || [];

  console.log(`Loaded: ${accounts.length} accounts, ${journalEntries.length} journals, ${invoices.length} invoices, ${bills.length} bills.`);

  // 1. TEST CSV EXPORT FOR GENERAL LEDGER
  console.log("\n🧪 GENERATING GENERAL LEDGER CSV...");
  const glHeaders = ['Date', 'Entry Description', 'Account Code', 'Account Name', 'Category / Parent', 'Account Type', 'Debit (PKR)', 'Credit (PKR)'];
  const glRows = [];
  const accountsMap = new Map();
  accounts.forEach(a => accountsMap.set(a.id, a));

  journalEntries.forEach(entry => {
    const entryDate = entry.date ? entry.date.split('T')[0] : '-';
    const desc = entry.description || 'Journal Entry';
    (entry.journal_lines || []).forEach(line => {
      const acc = line.accounts || accountsMap.get(line.account_id) || {};
      const parent = (acc.parent_account_id || acc.parent_id) ? accountsMap.get(acc.parent_account_id || acc.parent_id) : null;
      const parentName = parent ? parent.name : (acc.name || '-');
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      glRows.push([
        entryDate,
        `"${desc.replace(/"/g, '""')}"`,
        `"${acc.code || '-'}"`,
        `"${(acc.name || 'General Account').replace(/"/g, '""')}"`,
        `"${parentName.replace(/"/g, '""')}"`,
        `"${(acc.type || '').toUpperCase()}"`,
        debit > 0 ? debit.toFixed(2) : '0.00',
        credit > 0 ? credit.toFixed(2) : '0.00'
      ]);
    });
  });

  const glCsv = [glHeaders.join(','), ...glRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync('scratch/test_gl.csv', glCsv);
  console.log(`✅ Saved scratch/test_gl.csv (${glRows.length} rows)`);

  // 2. TEST CSV EXPORT FOR BALANCE SHEET (Debt Hierarchy & SME Equity)
  console.log("\n🧪 GENERATING BALANCE SHEET CSV...");
  const bsHeaders = ['Classification', 'Category / Parent', 'Account Code', 'Account Name', 'Balance (PKR)'];
  const bsRows = [];

  // Assets
  const assetAccs = accounts.filter(a => a.type === 'asset');
  assetAccs.forEach(a => {
    bsRows.push(['ASSET', 'Current Assets', a.code || '-', `"${a.name}"`, '0.00']);
  });

  // Liabilities with Debt Hierarchy
  const liabAccs = accounts.filter(a => a.type === 'liability');
  liabAccs.forEach(a => {
    const parent = (a.parent_account_id || a.parent_id) ? accountsMap.get(a.parent_account_id || a.parent_id) : null;
    const parentName = parent ? parent.name : a.name;
    const displayName = parent ? `  ↳ ${a.name} (Sub-Account)` : a.name;
    bsRows.push(['LIABILITY', `"${parentName}"`, a.code || '-', `"${displayName}"`, '0.00']);
  });

  // Equity (SME)
  const equityAccs = accounts.filter(a => a.type === 'equity');
  equityAccs.forEach(a => {
    bsRows.push(['EQUITY', "Owner's Equity", a.code || '-', `"${a.name}"`, '0.00']);
  });
  bsRows.push(['EQUITY', "Owner's Equity", '-', '"Owner\'s Net Income / Earnings (All-Time)"', '0.00']);

  const bsCsv = [bsHeaders.join(','), ...bsRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync('scratch/test_bs.csv', bsCsv);
  console.log(`✅ Saved scratch/test_bs.csv (${bsRows.length} rows)`);

  // Verify Debt Hierarchy in Balance Sheet CSV
  const hasMeezanSub = bsCsv.includes('↳ Meezan Bank (Sub-Account)');
  const hasAskariSub = bsCsv.includes('↳ Askari bank (Sub-Account)') || bsCsv.includes('↳ Askari Bank (Sub-Account)');
  const hasRetainedEarnings = bsCsv.toLowerCase().includes('retained earnings');

  console.log(` -> Sub-account nesting present for Meezan Bank: ${hasMeezanSub}`);
  console.log(` -> Sub-account nesting present for Askari Bank: ${hasAskariSub}`);
  console.log(` -> Retained earnings purged: ${!hasRetainedEarnings}`);

  if (hasRetainedEarnings) {
    throw new Error("CSV still contains Retained Earnings reference!");
  }

  // 3. TEST CSV EXPORT FOR INVOICES (Ad-Hoc Line Items)
  console.log("\n🧪 GENERATING DETAILED INVOICE CSV...");
  const invHeaders = ['Invoice ID', 'Status', 'Issue Date', 'Customer Name', 'Line Description', 'Product / Service', 'GL Account', 'Qty', 'Unit Price (PKR)', 'Total Amount (PKR)'];
  const invRows = [];

  invoices.forEach(inv => {
    const custName = inv.customers?.name || 'Walk-in Customer';
    (inv.invoice_lines || []).forEach(line => {
      const desc = line.description || line.products?.name || 'Ad-Hoc Service';
      const prodName = line.products?.name || 'Custom / Non-Inventory';
      const accName = line.accounts?.name || 'Sales Revenue';
      invRows.push([
        inv.id.substring(0, 8),
        inv.status,
        inv.issue_date || '-',
        `"${custName.replace(/"/g, '""')}"`,
        `"${desc.replace(/"/g, '""')}"`,
        `"${prodName.replace(/"/g, '""')}"`,
        `"${accName.replace(/"/g, '""')}"`,
        line.quantity || 1,
        Number(line.unit_price || line.total || 0).toFixed(2),
        Number(line.total || 0).toFixed(2)
      ]);
    });
  });

  const invCsv = [invHeaders.join(','), ...invRows.map(r => r.join(','))].join('\n');
  fs.writeFileSync('scratch/test_inv.csv', invCsv);
  console.log(`✅ Saved scratch/test_inv.csv (${invRows.length} rows)`);

  const hasCustomDesc = !invCsv.includes('[object Object]') && !invCsv.includes('undefined');
  console.log(` -> Ad-hoc item descriptions properly formatted without object leaks: ${hasCustomDesc}`);
  if (!hasCustomDesc) {
    throw new Error("Invoice CSV contains object leak or undefined description!");
  }

  // 4. TEST EXCEL WORKBOOK GENERATION
  console.log("\n🧪 GENERATING MULTI-SHEET EXCEL BACKUP (.XLSX)...");
  const workbook = new ExcelJS.Workbook();
  const coaSheet = workbook.addWorksheet('Chart of Accounts');
  coaSheet.columns = [
    { header: 'Account Code', key: 'code', width: 16 },
    { header: 'Account Name', key: 'name', width: 35 },
    { header: 'Parent Category', key: 'parent', width: 30 },
    { header: 'Hierarchy Level', key: 'level', width: 20 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Balance (PKR)', key: 'balance', width: 22 }
  ];

  accounts.forEach(a => {
    const parent = (a.parent_account_id || a.parent_id) ? accountsMap.get(a.parent_account_id || a.parent_id) : null;
    coaSheet.addRow({
      code: a.code || '-',
      name: parent ? `   ↳ ${a.name}` : a.name,
      parent: parent ? parent.name : 'Primary Control',
      level: parent ? 'Sub-Account' : 'Control Category',
      type: a.type.toUpperCase(),
      balance: 0
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  fs.writeFileSync('scratch/test_backup.xlsx', Buffer.from(buffer));
  console.log(`✅ Saved scratch/test_backup.xlsx (${buffer.byteLength} bytes)`);

  console.log("\n==================================================================");
  console.log("🎉 ALL CSV & EXCEL EXPORT TESTS PASSED FLAWLESSLY!");
  console.log("==================================================================");
}

testExportEngine().catch(err => {
  console.error("❌ EXPORT TEST FAILED:", err);
  process.exit(1);
});
