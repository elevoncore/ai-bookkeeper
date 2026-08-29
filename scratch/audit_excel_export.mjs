import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yfxncnxbqjcmqiztfhfn.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ybp9eVFfwMq1u5ScVIjykA_fotc-vEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runSelfAudit() {
  console.log("=================================================");
  console.log("  EXCEL EXPORT ENGINE — SELF-AUDIT & QA MATRIX   ");
  console.log("=================================================\n");

  // 1. Authenticate to retrieve valid JWT
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authError || !authData.session) {
    console.error("❌ Authentication Failed:", authError);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log("✅ Authenticated successfully as testuser@aibookkeeper.com");

  // 2. Trigger /api/export with all modules and 'all' timeframe
  console.log("📡 Requesting /api/export with { timeframe: 'all', selectedModules: ['Overview', 'Sales', 'Purchases', 'Accounting'] }...");
  
  const res = await fetch('http://localhost:3001/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      timeframe: 'all',
      selectedModules: ['Overview', 'Sales', 'Purchases', 'Accounting']
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`❌ /api/export returned HTTP ${res.status}:`, errText);
    process.exit(1);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filePath = './scratch/audit_export_output.xlsx';
  fs.writeFileSync(filePath, buffer);
  console.log(`✅ Received Excel buffer (${buffer.byteLength} bytes). Saved to ${filePath}\n`);

  // 3. Parse and inspect generated Excel with exceljs
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  let allPassed = true;
  const auditReport = [];

  function recordCheck(name, passed, details) {
    auditReport.push({ name, passed, details });
    if (passed) {
      console.log(`🟢 [PASSED] ${name}: ${details}`);
    } else {
      console.log(`🔴 [FAILED] ${name}: ${details}`);
      allPassed = false;
    }
  }

  // CHECK 1: Sheet Existence
  const sheetNames = workbook.worksheets.map(w => w.name);
  console.log("Found Sheets:", sheetNames.join(', '));
  const expectedSheets = ['Overview', 'Invoices', 'Customers', 'Bills', 'Suppliers', 'Chart of Accounts', 'Profit & Loss', 'Balance Sheet', 'Trial Balance', 'General Ledger'];
  const missingSheets = expectedSheets.filter(s => !sheetNames.includes(s));
  recordCheck("All Required Sheets Exist", missingSheets.length === 0, missingSheets.length === 0 ? `All 10 sheets present: ${sheetNames.join(', ')}` : `Missing: ${missingSheets.join(', ')}`);

  // CHECK 2: Overview Sheet NaN and Math Audit
  const overviewSheet = workbook.getWorksheet('Overview');
  let overviewHasNaN = false;
  let overviewCellsChecked = 0;
  overviewSheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      overviewCellsChecked++;
      const valStr = String(cell.value);
      if (valStr.includes('NaN') || valStr.includes('undefined') || valStr === 'null') {
        overviewHasNaN = true;
        console.error(`  ⚠️ Found NaN/undefined in Overview at Row ${rowNumber}, Col ${colNumber}: ${valStr}`);
      }
    });
  });
  recordCheck("Overview Sheet Has Zero NaN Values", !overviewHasNaN, `Scanned ${overviewCellsChecked} cells in Overview tab`);

  // Check specific Overview metrics
  const totalRevCell = overviewSheet.getCell('B6').value;
  const liquidCashCell = overviewSheet.getCell('E6').value;
  const totalExpCell = overviewSheet.getCell('B7').value;
  const arCell = overviewSheet.getCell('E7').value;
  const netProfitCell = overviewSheet.getCell('B8').value;
  const apCell = overviewSheet.getCell('E8').value;

  console.log("\n📊 Overview KPI Values Extracted:");
  console.log(`   - Total Revenue: ${totalRevCell} (Type: ${typeof totalRevCell})`);
  console.log(`   - Total Expenses: ${totalExpCell} (Type: ${typeof totalExpCell})`);
  console.log(`   - Net Profit: ${netProfitCell} (Type: ${typeof netProfitCell})`);
  console.log(`   - Liquid Cash: ${liquidCashCell} (Type: ${typeof liquidCashCell})`);
  console.log(`   - Accounts Receivable: ${arCell} (Type: ${typeof arCell})`);
  console.log(`   - Accounts Payable: ${apCell} (Type: ${typeof apCell})`);

  recordCheck("Overview Metrics Are Valid Numbers", 
    typeof totalRevCell === 'number' && !isNaN(totalRevCell) &&
    typeof liquidCashCell === 'number' && !isNaN(liquidCashCell) &&
    typeof arCell === 'number' && !isNaN(arCell) &&
    typeof apCell === 'number' && !isNaN(apCell),
    `Revenue=${totalRevCell}, Cash=${liquidCashCell}, AR=${arCell}, AP=${apCell}`
  );

  // CHECK 3: Chart of Accounts Audit
  const coaSheet = workbook.getWorksheet('Chart of Accounts');
  let coaHasNaN = false;
  let coaRowsWithNumbers = 0;
  let coaTotalRows = 0;

  coaSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Header
    coaTotalRows++;
    const balanceCell = row.getCell(7).value; // Running Balance column
    const debitsCell = row.getCell(5).value;
    const creditsCell = row.getCell(6).value;

    const valStr = `${row.getCell(1).value} ${balanceCell} ${debitsCell} ${creditsCell}`;
    if (valStr.includes('NaN') || valStr.includes('undefined')) {
      coaHasNaN = true;
      console.error(`  ⚠️ Found NaN in Chart of Accounts row ${rowNumber}: ${valStr}`);
    }

    if (typeof balanceCell === 'number' && !isNaN(balanceCell)) {
      coaRowsWithNumbers++;
    }
  });

  recordCheck("Chart of Accounts Zero NaN Values", !coaHasNaN, `All ${coaTotalRows} account rows audited`);
  recordCheck("Chart of Accounts Contains Real Numeric Balances", coaRowsWithNumbers > 0 && coaRowsWithNumbers === coaTotalRows, `${coaRowsWithNumbers}/${coaTotalRows} rows have numerical balances`);

  // CHECK 4: Invoices Sheet Audit (Relations & Items)
  const invoicesSheet = workbook.getWorksheet('Invoices');
  let invoiceCount = 0;
  let validInvoiceAmounts = 0;
  let validCustomerNames = 0;
  let validItemDescriptions = 0;

  invoicesSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    invoiceCount++;
    const invId = row.getCell(1).value;
    const custName = row.getCell(5).value;
    const items = row.getCell(6).value;
    const totalAmount = row.getCell(7).value;

    if (typeof totalAmount === 'number' && totalAmount > 0 && !isNaN(totalAmount)) {
      validInvoiceAmounts++;
    }
    if (custName && typeof custName === 'string' && custName.length > 0 && custName !== 'undefined') {
      validCustomerNames++;
    }
    if (items && typeof items === 'string' && items.length > 0 && items !== 'undefined') {
      validItemDescriptions++;
    }
  });

  recordCheck("Invoices Total Amount Column Not Empty/Null", validInvoiceAmounts > 0 && validInvoiceAmounts === invoiceCount, `${validInvoiceAmounts}/${invoiceCount} invoices have valid positive numeric total amounts`);
  recordCheck("Invoices Customer Name Column Populated", validCustomerNames === invoiceCount, `${validCustomerNames}/${invoiceCount} invoices have valid customer names`);
  recordCheck("Invoices Products/Items Column Populated", validItemDescriptions === invoiceCount, `${validItemDescriptions}/${invoiceCount} invoices have parsed line item descriptions`);

  // CHECK 5: Bills Sheet Audit (Relations & Items)
  const billsSheet = workbook.getWorksheet('Bills');
  let billCount = 0;
  let validBillAmounts = 0;
  let validSupplierNames = 0;
  let validBillItems = 0;

  billsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    billCount++;
    const suppName = row.getCell(6).value;
    const items = row.getCell(7).value;
    const totalAmount = row.getCell(8).value;

    if (typeof totalAmount === 'number' && totalAmount > 0 && !isNaN(totalAmount)) {
      validBillAmounts++;
    }
    if (suppName && typeof suppName === 'string' && suppName.length > 0 && suppName !== 'undefined') {
      validSupplierNames++;
    }
    if (items && typeof items === 'string' && items.length > 0 && items !== 'undefined') {
      validBillItems++;
    }
  });

  recordCheck("Bills Total Amount Column Not Empty/Null", validBillAmounts > 0 && validBillAmounts === billCount, `${validBillAmounts}/${billCount} bills have valid positive numeric total amounts`);
  recordCheck("Bills Supplier Name Column Populated", validSupplierNames === billCount, `${validSupplierNames}/${billCount} bills have valid supplier names`);
  recordCheck("Bills Items Column Populated", validBillItems === billCount, `${validBillItems}/${billCount} bills have parsed line items`);

  // CHECK 6: General Ledger Debit & Credit Column Audit
  const glSheet = workbook.getWorksheet('General Ledger');
  let glRowCount = 0;
  let glNumericDebitsOrCredits = 0;
  let glHasUUIDDescriptions = false;

  glSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    glRowCount++;
    const desc = String(row.getCell(2).value || '');
    const accName = row.getCell(3).value;
    const debit = row.getCell(4).value;
    const credit = row.getCell(5).value;

    // Check if full 36-char raw UUID exists in description
    if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(desc)) {
      glHasUUIDDescriptions = true;
    }

    if (typeof debit === 'number' && typeof credit === 'number' && !isNaN(debit) && !isNaN(credit)) {
      glNumericDebitsOrCredits++;
    }
  });

  recordCheck("General Ledger Debit & Credit Columns Contain Numbers", glNumericDebitsOrCredits === glRowCount, `${glNumericDebitsOrCredits}/${glRowCount} GL lines have valid numeric debits & credits`);
  recordCheck("General Ledger Descriptions Cleaned of Raw UUIDs", !glHasUUIDDescriptions, `All ${glRowCount} GL descriptions properly formatted`);

  // CHECK 7: Trial Balance Balanced Audit
  const tbSheet = workbook.getWorksheet('Trial Balance');
  let tbRowCount = 0;
  let tbTotalDebits = 0;
  let tbTotalCredits = 0;

  tbSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    tbRowCount++;
    const name = row.getCell(1).value;
    const debit = row.getCell(3).value;
    const credit = row.getCell(4).value;

    if (name === 'TOTALS (BALANCED)') {
      tbTotalDebits = Number(debit);
      tbTotalCredits = Number(credit);
    }
  });

  recordCheck("Trial Balance Is Mathematically Balanced", tbTotalDebits > 0 && Math.abs(tbTotalDebits - tbTotalCredits) < 0.01, `Debits: ${tbTotalDebits.toLocaleString()} PKR == Credits: ${tbTotalCredits.toLocaleString()} PKR`);

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 ALL 12 AUDIT ASSERTIONS PASSED PERFECTLY!");
    console.log("=================================================");
    process.exit(0);
  } else {
    console.error("❌ SOME AUDIT ASSERTIONS FAILED.");
    console.log("=================================================");
    process.exit(1);
  }
}

runSelfAudit().catch(err => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
