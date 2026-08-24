import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import * as ExcelJS from "exceljs";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { timeframe, selectedModules } = await request.json();

    let startDate: string | null = null;
    if (timeframe === '7d') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (timeframe === '30d') startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    else if (timeframe === '1y') startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Bookkeeper';
    workbook.created = new Date();

    // 1. FETCH BASE DATA FOR CALCULATIONS
    // We need all accounts and all journal entries/lines to calculate running balances and trial balance
    const { data: allAccountsData } = await supabase.from('accounts').select('*').eq('user_id', user.id).order('type', { ascending: true });
    const { data: allJournalsData } = await supabase.from('journal_entries').select('*, journal_lines(*)').eq('user_id', user.id).order('date', { ascending: true });
    
    const accounts = allAccountsData || [];
    const journals = allJournalsData || [];

    // Calculate balances
    // Balance Logic: 
    // Asset, Expense -> Debit increases, Credit decreases
    // Liability, Equity, Revenue -> Credit increases, Debit decreases
    const accountBalances: Record<string, { allTime: number, period: number, totalDebit: number, totalCredit: number }> = {};
    accounts.forEach(acc => {
      accountBalances[acc.id] = { allTime: 0, period: 0, totalDebit: 0, totalCredit: 0 };
    });

    journals.forEach(entry => {
      const isWithinPeriod = !startDate || new Date(entry.date) >= new Date(startDate);
      
      entry.journal_lines?.forEach((line: any) => {
        if (!accountBalances[line.account_id]) return;
        
        const acc = accounts.find(a => a.id === line.account_id);
        if (!acc) return;

        const amount = Number(line.amount);
        accountBalances[line.account_id].totalDebit += line.is_debit ? amount : 0;
        accountBalances[line.account_id].totalCredit += !line.is_debit ? amount : 0;

        let impact = 0;
        if (acc.type === 'Asset' || acc.type === 'Expense') {
          impact = line.is_debit ? amount : -amount;
        } else {
          impact = line.is_debit ? -amount : amount;
        }

        accountBalances[line.account_id].allTime += impact;
        if (isWithinPeriod) {
          accountBalances[line.account_id].period += impact;
        }
      });
    });

    // 2. OVERVIEW SHEET
    if (selectedModules.includes('Overview')) {
      const overviewSheet = workbook.addWorksheet('Overview', { views: [{ showGridLines: false }] });
      overviewSheet.columns = [
        { key: 'metric', width: 35 },
        { key: 'value', width: 25 },
        { key: 'spacer', width: 10 },
        { key: 'metric2', width: 35 },
        { key: 'value2', width: 25 },
      ];

      // Title
      overviewSheet.mergeCells('A1:E2');
      const titleCell = overviewSheet.getCell('A1');
      titleCell.value = 'AI BOOKKEEPER - FINANCIAL OVERVIEW';
      titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Calculate Metrics
      const totalRevenue = accounts.filter(a => a.type === 'Revenue').reduce((sum, a) => sum + accountBalances[a.id].period, 0);
      const totalExpenses = accounts.filter(a => a.type === 'Expense').reduce((sum, a) => sum + accountBalances[a.id].period, 0);
      const netPosition = totalRevenue - totalExpenses;
      const liquidCash = accounts.filter(a => a.is_cash_account).reduce((sum, a) => sum + accountBalances[a.id].allTime, 0);
      const arAccount = accounts.find(a => a.system_type === 'accounts_receivable' || a.name === 'Accounts Receivable');
      const apAccount = accounts.find(a => a.system_type === 'accounts_payable' || a.name === 'Accounts Payable');
      const totalAR = arAccount ? accountBalances[arAccount.id].allTime : 0;
      const totalAP = apAccount ? accountBalances[apAccount.id].allTime : 0;

      // Add Data Blocks
      overviewSheet.addRow([]); // Spacer
      
      const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF3B82F6' } } };
      const dataStyle = { font: { bold: true, size: 14 } };

      overviewSheet.addRow(['INCOME & EXPENSES (PERIOD)', '', '', 'LIQUIDITY & RECEIVABLES (ALL TIME)', '']);
      overviewSheet.getCell('A4').style = headerStyle; overviewSheet.getCell('B4').style = headerStyle;
      overviewSheet.getCell('D4').style = headerStyle; overviewSheet.getCell('E4').style = headerStyle;

      overviewSheet.addRow(['Total Revenue', totalRevenue, '', 'Liquid Cash', liquidCash]);
      overviewSheet.getCell('A5').font = { bold: true }; overviewSheet.getCell('B5').style = dataStyle; overviewSheet.getCell('B5').numFmt = '#,##0.00';
      overviewSheet.getCell('D5').font = { bold: true }; overviewSheet.getCell('E5').style = dataStyle; overviewSheet.getCell('E5').numFmt = '#,##0.00';

      overviewSheet.addRow(['Total Expenses', totalExpenses, '', 'Accounts Receivable (A/R)', totalAR]);
      overviewSheet.getCell('A6').font = { bold: true }; overviewSheet.getCell('B6').style = dataStyle; overviewSheet.getCell('B6').numFmt = '#,##0.00';
      overviewSheet.getCell('D6').font = { bold: true }; overviewSheet.getCell('E6').style = dataStyle; overviewSheet.getCell('E6').numFmt = '#,##0.00';

      overviewSheet.addRow(['Net Position (Profit/Loss)', netPosition, '', 'Accounts Payable (A/P)', totalAP]);
      overviewSheet.getCell('A7').font = { bold: true }; overviewSheet.getCell('B7').style = dataStyle; overviewSheet.getCell('B7').numFmt = '#,##0.00';
      overviewSheet.getCell('D7').font = { bold: true }; overviewSheet.getCell('E7').style = dataStyle; overviewSheet.getCell('E7').numFmt = '#,##0.00';

      // Color coding Net Position
      overviewSheet.getCell('B7').font = { bold: true, size: 14, color: { argb: netPosition >= 0 ? 'FF16A34A' : 'FFDC2626' } };

      overviewSheet.addRow([]);
      overviewSheet.addRow(['Export Parameters']);
      overviewSheet.getCell('A9').font = { bold: true, underline: true };
      overviewSheet.addRow(['Generation Date:', new Date().toLocaleString()]);
      overviewSheet.addRow(['Timeframe Filter:', timeframe.toUpperCase()]);
    }

    // 3. SALES MODULE
    if (selectedModules.includes('Sales')) {
      const invoicesSheet = workbook.addWorksheet('Invoices');
      invoicesSheet.columns = [
        { header: 'Invoice Number', key: 'invoice_number', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Issue Date', key: 'issue_date', width: 15 },
        { header: 'Due Date', key: 'due_date', width: 15 },
        { header: 'Customer Name', key: 'customer_name', width: 25 },
        { header: 'Products / Items', key: 'items', width: 45 },
        { header: 'Total Amount', key: 'total_amount', width: 15 },
        { header: 'Amount Paid', key: 'amount_paid', width: 15 }
      ];
      invoicesSheet.getRow(1).font = { bold: true };

      let invQuery = supabase.from('invoices').select('*, customers(name), invoice_lines(description, amount)').eq('user_id', user.id).order('issue_date', { ascending: false });
      if (startDate) invQuery = invQuery.gte('issue_date', startDate);
      
      const { data: invoices } = await invQuery;
      if (invoices) {
        invoices.forEach(inv => {
          const itemsStr = inv.invoice_lines?.map((l: any) => l.description).join(', ') || '';
          invoicesSheet.addRow({
            invoice_number: inv.invoice_number,
            status: inv.status,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            customer_name: inv.customers?.name || 'Walk-in Customer',
            items: itemsStr,
            total_amount: inv.total_amount,
            amount_paid: inv.amount_paid
          });
        });
      }
    }

    // 4. PURCHASES MODULE
    if (selectedModules.includes('Purchases')) {
      const billsSheet = workbook.addWorksheet('Bills');
      billsSheet.columns = [
        { header: 'Bill Number', key: 'bill_number', width: 20 },
        { header: 'External Ref', key: 'external_reference', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Issue Date', key: 'issue_date', width: 15 },
        { header: 'Supplier Name', key: 'supplier_name', width: 25 },
        { header: 'Purchased Items', key: 'items', width: 45 },
        { header: 'Total Amount', key: 'total_amount', width: 15 },
        { header: 'Amount Paid', key: 'amount_paid', width: 15 }
      ];
      billsSheet.getRow(1).font = { bold: true };

      let billQuery = supabase.from('bills').select('*, suppliers(name), bill_lines(description, amount)').eq('user_id', user.id).order('issue_date', { ascending: false });
      if (startDate) billQuery = billQuery.gte('issue_date', startDate);
      
      const { data: bills } = await billQuery;
      if (bills) {
        bills.forEach(bill => {
          const itemsStr = bill.bill_lines?.map((l: any) => l.description).join(', ') || '';
          billsSheet.addRow({
            bill_number: bill.bill_number,
            external_reference: bill.external_reference || '-',
            status: bill.status,
            issue_date: bill.issue_date,
            supplier_name: bill.suppliers?.name || 'Unknown Supplier',
            items: itemsStr,
            total_amount: bill.total_amount,
            amount_paid: bill.amount_paid
          });
        });
      }
    }

    // 5. ACCOUNTING MODULE
    if (selectedModules.includes('Accounting')) {
      // 5.1 Chart of Accounts
      const coaSheet = workbook.addWorksheet('Chart of Accounts');
      coaSheet.columns = [
        { header: 'Account Name', key: 'name', width: 30 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'System Protected', key: 'is_system', width: 18 },
        { header: 'Is Cash Account', key: 'is_cash', width: 18 },
        { header: 'Running Balance (PKR)', key: 'balance', width: 25 }
      ];
      coaSheet.getRow(1).font = { bold: true };

      accounts.forEach(acc => {
        coaSheet.addRow({
          name: acc.name,
          type: acc.type,
          category: acc.category,
          is_system: acc.is_system_account ? 'Yes' : 'No',
          is_cash: acc.is_cash_account ? 'Yes' : 'No',
          balance: accountBalances[acc.id].allTime
        });
      });

      // 5.2 Profit & Loss
      const pnlSheet = workbook.addWorksheet('Profit & Loss');
      pnlSheet.columns = [
        { header: 'Category / Account', key: 'name', width: 40 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      pnlSheet.getRow(1).font = { bold: true };
      
      const revenues = accounts.filter(a => a.type === 'Revenue');
      const expenses = accounts.filter(a => a.type === 'Expense');
      const totalRev = revenues.reduce((s, a) => s + accountBalances[a.id].period, 0);
      const totalExp = expenses.reduce((s, a) => s + accountBalances[a.id].period, 0);

      pnlSheet.addRow({ name: 'REVENUE' }).font = { bold: true };
      revenues.forEach(r => pnlSheet.addRow({ name: `  ${r.name}`, amount: accountBalances[r.id].period }));
      pnlSheet.addRow({ name: 'Total Revenue', amount: totalRev }).font = { bold: true };
      pnlSheet.addRow([]);
      
      pnlSheet.addRow({ name: 'EXPENSES' }).font = { bold: true };
      expenses.forEach(e => pnlSheet.addRow({ name: `  ${e.name}`, amount: accountBalances[e.id].period }));
      pnlSheet.addRow({ name: 'Total Expenses', amount: totalExp }).font = { bold: true };
      pnlSheet.addRow([]);

      pnlSheet.addRow({ name: 'NET INCOME', amount: totalRev - totalExp }).font = { bold: true, color: { argb: 'FF16A34A' } };

      // 5.3 Balance Sheet
      const bsSheet = workbook.addWorksheet('Balance Sheet');
      bsSheet.columns = [
        { header: 'Category / Account', key: 'name', width: 40 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      bsSheet.getRow(1).font = { bold: true };

      const assets = accounts.filter(a => a.type === 'Asset');
      const liabilities = accounts.filter(a => a.type === 'Liability');
      const equity = accounts.filter(a => a.type === 'Equity');

      const totalAssets = assets.reduce((s, a) => s + accountBalances[a.id].allTime, 0);
      const totalLiab = liabilities.reduce((s, a) => s + accountBalances[a.id].allTime, 0);
      const totalEqui = equity.reduce((s, a) => s + accountBalances[a.id].allTime, 0);
      // Retained Earnings (Net Income of all time) must be added to Equity
      const allTimeRev = accounts.filter(a => a.type === 'Revenue').reduce((s, a) => s + accountBalances[a.id].allTime, 0);
      const allTimeExp = accounts.filter(a => a.type === 'Expense').reduce((s, a) => s + accountBalances[a.id].allTime, 0);
      const retainedEarnings = allTimeRev - allTimeExp;

      bsSheet.addRow({ name: 'ASSETS' }).font = { bold: true };
      assets.forEach(a => bsSheet.addRow({ name: `  ${a.name}`, amount: accountBalances[a.id].allTime }));
      bsSheet.addRow({ name: 'Total Assets', amount: totalAssets }).font = { bold: true };
      bsSheet.addRow([]);

      bsSheet.addRow({ name: 'LIABILITIES' }).font = { bold: true };
      liabilities.forEach(l => bsSheet.addRow({ name: `  ${l.name}`, amount: accountBalances[l.id].allTime }));
      bsSheet.addRow({ name: 'Total Liabilities', amount: totalLiab }).font = { bold: true };
      bsSheet.addRow([]);

      bsSheet.addRow({ name: 'EQUITY' }).font = { bold: true };
      equity.forEach(e => bsSheet.addRow({ name: `  ${e.name}`, amount: accountBalances[e.id].allTime }));
      bsSheet.addRow({ name: '  Retained Earnings', amount: retainedEarnings });
      bsSheet.addRow({ name: 'Total Equity', amount: totalEqui + retainedEarnings }).font = { bold: true };

      // 5.4 Trial Balance
      const tbSheet = workbook.addWorksheet('Trial Balance');
      tbSheet.columns = [
        { header: 'Account Name', key: 'name', width: 35 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Debit Balance', key: 'debit', width: 20 },
        { header: 'Credit Balance', key: 'credit', width: 20 }
      ];
      tbSheet.getRow(1).font = { bold: true };

      let tbDebit = 0;
      let tbCredit = 0;
      accounts.forEach(acc => {
        // A trial balance shows the net debit or credit balance
        const netDebit = accountBalances[acc.id].totalDebit - accountBalances[acc.id].totalCredit;
        let debitBal = 0;
        let creditBal = 0;
        if (netDebit > 0) debitBal = netDebit;
        else if (netDebit < 0) creditBal = Math.abs(netDebit);

        if (debitBal > 0 || creditBal > 0) {
          tbSheet.addRow({
            name: acc.name,
            type: acc.type,
            debit: debitBal > 0 ? debitBal : '',
            credit: creditBal > 0 ? creditBal : ''
          });
          tbDebit += debitBal;
          tbCredit += creditBal;
        }
      });
      tbSheet.addRow({ name: 'TOTALS', debit: tbDebit, credit: tbCredit }).font = { bold: true };

      // 5.5 General Ledger
      const glSheet = workbook.addWorksheet('General Ledger');
      glSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Account', key: 'account_name', width: 25 },
        { header: 'Debit', key: 'debit', width: 15 },
        { header: 'Credit', key: 'credit', width: 15 }
      ];
      glSheet.getRow(1).font = { bold: true };

      journals.forEach(entry => {
        const isWithinPeriod = !startDate || new Date(entry.date) >= new Date(startDate);
        if (isWithinPeriod && entry.journal_lines) {
          entry.journal_lines.forEach((line: any) => {
            const accName = accounts.find(a => a.id === line.account_id)?.name || 'Unknown';
            glSheet.addRow({
              date: entry.date,
              description: entry.description || '-',
              account_name: accName,
              debit: line.is_debit ? line.amount : '',
              credit: !line.is_debit ? line.amount : ''
            });
          });
        }
      });
    }

    if (workbook.worksheets.length === 0) {
      const emptySheet = workbook.addWorksheet('Empty');
      emptySheet.addRow(['No data modules selected']);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Bookkeeper_Export.xlsx"'
      }
    });
  } catch (error) {
    console.error("Export API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
