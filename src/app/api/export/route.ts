import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import ExcelJS from "exceljs";

export async function POST(request: Request) {
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

    // Ensure default chart of accounts exist
    await supabase.rpc('initialize_default_accounts', { p_user_id: user.id });

    const body = await request.json().catch(() => ({}));
    const { 
      timeframe = 'all', 
      selectedModules = ['Overview', 'Sales', 'Purchases', 'Accounting'],
      format = 'xlsx', // 'xlsx' | 'csv'
      exportType = 'all' // 'all' | 'ledger' | 'balance_sheet' | 'pnl' | 'invoices' | 'bills' | 'coa'
    } = body;

    let startDate: string | null = null;
    const now = new Date();
    if (timeframe === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (timeframe === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (timeframe === '1y') {
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // 1. FETCH ALL BASE DATA IN PARALLEL
    const [accountsRes, journalsRes, invoicesRes, billsRes, customersRes, suppliersRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('name', { ascending: true }),
      supabase.from('journal_entries').select('*, journal_lines(*, accounts(id, name, type, code, parent_account_id, parent_id))').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('invoices').select('*, customers(id, name, email, phone), invoice_lines(*, accounts(name, type), products(id, name, cost, price, is_inventory_tracked))').eq('user_id', user.id).order('issue_date', { ascending: false }),
      supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(*, accounts(name, type), products(id, name, cost, price))').eq('user_id', user.id).order('issue_date', { ascending: false }),
      supabase.from('customers').select('*').eq('user_id', user.id).order('name', { ascending: true }),
      supabase.from('suppliers').select('*').eq('user_id', user.id).order('name', { ascending: true })
    ]);

    const accounts = accountsRes.data || [];
    const journalEntries = journalsRes.data || [];
    const invoices = invoicesRes.data || [];
    const bills = billsRes.data || [];
    const allCustomers = customersRes.data || [];
    const allSuppliers = suppliersRes.data || [];

    // Helper map for accounts
    const accountsMap = new Map<string, any>();
    accounts.forEach(acc => accountsMap.set(acc.id, acc));

    // 2. MATHEMATICAL AGGREGATIONS (DEBIT & CREDIT PARSING)
    const accountBalances = new Map<string, { debitsCents: number, creditsCents: number, periodDebitsCents: number, periodCreditsCents: number }>();
    for (const acc of accounts) {
      accountBalances.set(acc.id, { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 });
    }

    // Process all journal lines
    for (const entry of journalEntries) {
      const entryDate = entry.date ? entry.date.split('T')[0] : '';
      const isWithinPeriod = !startDate || entryDate >= startDate;

      if (entry.journal_lines && Array.isArray(entry.journal_lines)) {
        for (const line of entry.journal_lines) {
          const debitVal = Number(line.debit || 0);
          const creditVal = Number(line.credit || 0);
          const debitCents = Math.round(debitVal * 100);
          const creditCents = Math.round(creditVal * 100);

          let b = accountBalances.get(line.account_id);
          if (!b) {
            b = { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 };
            accountBalances.set(line.account_id, b);
          }

          b.debitsCents += debitCents;
          b.creditsCents += creditCents;

          if (isWithinPeriod) {
            b.periodDebitsCents += debitCents;
            b.periodCreditsCents += creditCents;
          }
        }
      }
    }

    // Helper function to get computed balance for an account
    function getAccountBalance(acc: any, isPeriodOnly = false): number {
      const b = accountBalances.get(acc.id) || { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 };
      const d = isPeriodOnly ? b.periodDebitsCents : b.debitsCents;
      const c = isPeriodOnly ? b.periodCreditsCents : b.creditsCents;
      const type = (acc.type || '').toLowerCase();

      if (type === 'asset' || type === 'expense') {
        return (d - c) / 100;
      } else {
        // liability, equity, revenue
        return (c - d) / 100;
      }
    }

    // Helper to format Entity IDs
    function formatEntityId(prefix: string, item: any): string {
      if (item.code) return item.code;
      if (item.invoice_number) return item.invoice_number;
      if (item.bill_number) return item.bill_number;
      if (item.name === 'Walk-in Customer') return 'CUST-WALKIN';
      const idStr = item.id ? item.id.substring(0, 6).toUpperCase() : '001';
      return `${prefix}-${idStr}`;
    }

    // Helper to sanitize description
    function sanitizeDescription(desc: string | null | undefined): string {
      if (!desc) return '-';
      return desc.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, (match) => {
        return match.substring(0, 6).toUpperCase();
      });
    }

    // Handle CSV Export Mode directly if requested
    if (format === 'csv') {
      let csvContent = "";
      let filename = `export_${exportType}_${new Date().toISOString().split('T')[0]}.csv`;

      if (exportType === 'ledger' || exportType === 'all') {
        // General Ledger CSV
        const headers = ['Date', 'Entry Description', 'Account Code', 'Account Name', 'Category / Parent', 'Account Type', 'Debit (PKR)', 'Credit (PKR)'];
        const rows: any[] = [];
        const filteredJournals = startDate
          ? journalEntries.filter(j => (j.date || '').split('T')[0] >= startDate)
          : journalEntries;

        filteredJournals.forEach(entry => {
          const entryDate = entry.date ? entry.date.split('T')[0] : '-';
          const desc = sanitizeDescription(entry.description);

          (entry.journal_lines || []).forEach((line: any) => {
            const acc = line.accounts || accountsMap.get(line.account_id) || {};
            const parentAcc = (acc.parent_account_id || acc.parent_id) ? accountsMap.get(acc.parent_account_id || acc.parent_id) : null;
            const parentName = parentAcc ? parentAcc.name : (acc.name || '-');
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);

            rows.push([
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
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      } else if (exportType === 'balance_sheet') {
        // Balance Sheet CSV with Debt Hierarchy & SME Owner's Equity
        const headers = ['Classification', 'Category / Parent', 'Account Code', 'Account Name', 'Balance (PKR)'];
        const rows: any[] = [];

        // Assets
        const assetAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'asset');
        assetAccs.forEach(a => {
          rows.push(['ASSET', 'Current Assets', a.code || '-', `"${a.name}"`, getAccountBalance(a, false).toFixed(2)]);
        });

        // Liabilities with Debt Hierarchy
        const liabAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'liability');
        liabAccs.forEach(a => {
          const parent = (a.parent_account_id || a.parent_id) ? accountsMap.get(a.parent_account_id || a.parent_id) : null;
          const parentName = parent ? parent.name : a.name;
          const isChild = !!parent;
          const displayName = isChild ? `  ↳ ${a.name} (Sub-Account)` : a.name;
          rows.push(['LIABILITY', `"${parentName}"`, a.code || '-', `"${displayName}"`, getAccountBalance(a, false).toFixed(2)]);
        });

        // Equity
        const equityAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'equity');
        equityAccs.forEach(a => {
          rows.push(['EQUITY', "Owner's Equity", a.code || '-', `"${a.name}"`, getAccountBalance(a, false).toFixed(2)]);
        });

        // Net Earnings (All-Time)
        const revenueAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'revenue');
        const expenseAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'expense');
        const allTimeRev = revenueAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
        const allTimeExp = expenseAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
        const netEarnings = allTimeRev - allTimeExp;
        rows.push(['EQUITY', "Owner's Equity", '-', '"Owner\'s Net Income / Earnings (All-Time)"', netEarnings.toFixed(2)]);

        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      } else if (exportType === 'invoices') {
        const headers = ['Invoice ID', 'Status', 'Issue Date', 'Due Date', 'Customer Name', 'Line Description', 'Product / Service', 'GL Account', 'Qty', 'Unit Price (PKR)', 'Total Amount (PKR)'];
        const rows: any[] = [];
        invoices.forEach(inv => {
          const custName = inv.customers?.name || 'Walk-in Customer';
          (inv.invoice_lines || []).forEach((line: any) => {
            const desc = line.description || line.products?.name || 'Ad-Hoc Service';
            const prodName = line.products?.name || 'Custom / Non-Inventory';
            const accName = line.accounts?.name || 'Sales Revenue';
            rows.push([
              formatEntityId('INV', inv),
              inv.status || 'PAID',
              inv.issue_date || '-',
              inv.due_date || '-',
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
        csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      }

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    // 3. INITIALIZE EXCEL WORKBOOK
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Bookkeeper';
    workbook.created = new Date();

    // -------------------------------------------------------------
    // SHEET 1: OVERVIEW DASHBOARD
    // -------------------------------------------------------------
    if (selectedModules.includes('Overview')) {
      const overviewSheet = workbook.addWorksheet('Overview', {
        views: [{ showGridLines: true }]
      });

      overviewSheet.columns = [
        { key: 'colA', width: 34 },
        { key: 'colB', width: 24 },
        { key: 'colC', width: 6 },
        { key: 'colD', width: 34 },
        { key: 'colE', width: 24 }
      ];

      // Banner Header
      overviewSheet.mergeCells('A1:E2');
      const titleCell = overviewSheet.getCell('A1');
      titleCell.value = 'AI BOOKKEEPER — EXECUTIVE FINANCIAL DASHBOARD';
      titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Subtitle Info
      overviewSheet.mergeCells('A3:E3');
      const subCell = overviewSheet.getCell('A3');
      subCell.value = `Export Scope: ${timeframe.toUpperCase()} | Generated: ${new Date().toLocaleString()} | User: ${user.email || 'Authenticated User'}`;
      subCell.font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
      subCell.alignment = { vertical: 'middle', horizontal: 'center' };
      subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

      // Calculate Core KPIs
      const revenueAccounts = accounts.filter(a => (a.type || '').toLowerCase() === 'revenue');
      const expenseAccounts = accounts.filter(a => (a.type || '').toLowerCase() === 'expense');
      
      const totalRevenuePeriod = revenueAccounts.reduce((sum, a) => sum + getAccountBalance(a, true), 0);
      const totalExpensesPeriod = expenseAccounts.reduce((sum, a) => sum + getAccountBalance(a, true), 0);
      const netProfitPeriod = totalRevenuePeriod - totalExpensesPeriod;

      const cashAccounts = accounts.filter(a => (a.type || '').toLowerCase() === 'asset' && (a.is_cash_account || a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash')));
      const totalLiquidCash = cashAccounts.reduce((sum, a) => sum + getAccountBalance(a, false), 0);

      const totalARInvoices = invoices.reduce((sum, inv) => {
        if (inv.status !== 'paid' && inv.status !== 'PAID') {
          return sum + Number(inv.balance_due ?? (Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)));
        }
        return sum;
      }, 0);

      const totalAPBills = bills.reduce((sum, bill) => {
        if (bill.status !== 'paid' && bill.status !== 'PAID') {
          return sum + Number(bill.balance_due ?? (Number(bill.total_amount || 0) - Number(bill.amount_paid || 0)));
        }
        return sum;
      }, 0);

      overviewSheet.addRow([]); // Spacer
      const row5 = overviewSheet.addRow(['PROFIT & LOSS SUMMARY (PERIOD)', '', '', 'BALANCE & LIQUIDITY (ALL-TIME)', '']);
      row5.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      overviewSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      overviewSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      overviewSheet.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
      overviewSheet.getCell('E5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

      const row6 = overviewSheet.addRow(['Total Operating Revenue', totalRevenuePeriod, '', 'Total Liquid Cash Reserves', totalLiquidCash]);
      overviewSheet.getCell('A6').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('B6').font = { bold: true, size: 12, color: { argb: 'FF16A34A' } };
      overviewSheet.getCell('B6').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D6').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('E6').font = { bold: true, size: 12, color: { argb: 'FF0284C7' } };
      overviewSheet.getCell('E6').numFmt = '#,##0.00 "PKR"';

      const row7 = overviewSheet.addRow(['Total Operating Expenses', totalExpensesPeriod, '', 'Accounts Receivable (A/R Owed)', totalARInvoices]);
      overviewSheet.getCell('A7').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('B7').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
      overviewSheet.getCell('B7').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D7').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('E7').font = { bold: true, size: 12, color: { argb: 'FF059669' } };
      overviewSheet.getCell('E7').numFmt = '#,##0.00 "PKR"';

      const row8 = overviewSheet.addRow(['Net Profit / (Loss)', netProfitPeriod, '', 'Accounts Payable (A/P Owed)', totalAPBills]);
      overviewSheet.getCell('A8').font = { bold: true, color: { argb: 'FF0F172A' } };
      overviewSheet.getCell('B8').font = { bold: true, size: 13, color: { argb: netProfitPeriod >= 0 ? 'FF16A34A' : 'FFDC2626' } };
      overviewSheet.getCell('B8').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D8').font = { bold: true, color: { argb: 'FF0F172A' } };
      overviewSheet.getCell('E8').font = { bold: true, size: 12, color: { argb: 'FFE11D48' } };
      overviewSheet.getCell('E8').numFmt = '#,##0.00 "PKR"';
    }

    // -------------------------------------------------------------
    // SHEET 2: SALES MODULE (Invoices & Detailed Lines)
    // -------------------------------------------------------------
    if (selectedModules.includes('Sales')) {
      const invoicesSheet = workbook.addWorksheet('Invoices Summary');
      invoicesSheet.columns = [
        { header: 'Invoice ID', key: 'invoice_id', width: 18 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Issue Date', key: 'issue_date', width: 14 },
        { header: 'Due Date', key: 'due_date', width: 14 },
        { header: 'Customer Name', key: 'customer_name', width: 28 },
        { header: 'Line Item Summary', key: 'items', width: 45 },
        { header: 'Total Amount (PKR)', key: 'total_amount', width: 20 },
        { header: 'Amount Paid (PKR)', key: 'amount_paid', width: 20 },
        { header: 'Balance Due (PKR)', key: 'balance_due', width: 20 }
      ];

      invoicesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      invoicesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

      const filteredInvoices = startDate 
        ? invoices.filter(inv => (inv.issue_date || '').split('T')[0] >= startDate)
        : invoices;

      filteredInvoices.forEach(inv => {
        const lineItems = (inv.invoice_lines || [])
          .map((l: any) => l.description || l.products?.name || 'Custom Item')
          .filter(Boolean);
        const itemsStr = lineItems.length > 0 ? lineItems.join(', ') : 'Invoice Services/Goods';
        const custName = inv.customers?.name || 'Walk-in Customer';
        const totalAmount = Number(inv.total_amount || 0);
        const amountPaid = Number(inv.amount_paid ?? (totalAmount - Number(inv.balance_due || 0)));
        const balanceDue = Number(inv.balance_due ?? (totalAmount - amountPaid));

        const row = invoicesSheet.addRow({
          invoice_id: formatEntityId('INV', inv),
          status: (inv.status || 'PAID').toUpperCase(),
          issue_date: inv.issue_date || (inv.created_at ? inv.created_at.split('T')[0] : '-'),
          due_date: inv.due_date || '-',
          customer_name: custName,
          items: itemsStr,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          balance_due: balanceDue
        });

        row.getCell('total_amount').numFmt = '#,##0.00';
        row.getCell('amount_paid').numFmt = '#,##0.00';
        row.getCell('balance_due').numFmt = '#,##0.00';
      });

      // Detailed Line Items Sheet
      const invLinesSheet = workbook.addWorksheet('Invoice Line Items');
      invLinesSheet.columns = [
        { header: 'Invoice ID', key: 'invoice_id', width: 18 },
        { header: 'Customer Name', key: 'customer_name', width: 28 },
        { header: 'Line Description / Service', key: 'description', width: 45 },
        { header: 'Product Item', key: 'product_name', width: 28 },
        { header: 'GL Account', key: 'account_name', width: 24 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit Price (PKR)', key: 'unit_price', width: 18 },
        { header: 'Line Total (PKR)', key: 'total', width: 18 }
      ];
      invLinesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      invLinesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

      filteredInvoices.forEach(inv => {
        const custName = inv.customers?.name || 'Walk-in Customer';
        (inv.invoice_lines || []).forEach((line: any) => {
          const desc = line.description || line.products?.name || 'Custom Service';
          const prodName = line.products?.name || 'Ad-Hoc / Custom Item';
          const accName = line.accounts?.name || 'Sales Revenue';
          const row = invLinesSheet.addRow({
            invoice_id: formatEntityId('INV', inv),
            customer_name: custName,
            description: desc,
            product_name: prodName,
            account_name: accName,
            quantity: line.quantity || 1,
            unit_price: Number(line.unit_price || line.total || 0),
            total: Number(line.total || 0)
          });
          row.getCell('unit_price').numFmt = '#,##0.00';
          row.getCell('total').numFmt = '#,##0.00';
        });
      });

      // Customers Sheet
      const customersSheet = workbook.addWorksheet('Customers');
      customersSheet.columns = [
        { header: 'Customer ID', key: 'id', width: 18 },
        { header: 'Customer Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Total Invoiced (PKR)', key: 'total_invoiced', width: 22 },
        { header: 'Outstanding A/R (PKR)', key: 'balance', width: 25 }
      ];
      customersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      customersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

      allCustomers.forEach(c => {
        const custInvoices = invoices.filter(inv => inv.customer_id === c.id);
        const totalInvoiced = custInvoices.reduce((s, inv) => s + Number(inv.total_amount || 0), 0);
        const totalOutstanding = custInvoices.reduce((s, inv) => {
          if (inv.status !== 'paid' && inv.status !== 'PAID') {
            return s + Number(inv.balance_due ?? (Number(inv.total_amount || 0) - Number(inv.amount_paid || 0)));
          }
          return s;
        }, 0);

        const row = customersSheet.addRow({
          id: formatEntityId('CUST', c),
          name: c.name,
          email: c.email || '-',
          phone: c.phone || '-',
          total_invoiced: totalInvoiced,
          balance: totalOutstanding
        });
        row.getCell('total_invoiced').numFmt = '#,##0.00';
        row.getCell('balance').numFmt = '#,##0.00';
      });
    }

    // -------------------------------------------------------------
    // SHEET 3: PURCHASES MODULE (Bills & Detailed Lines)
    // -------------------------------------------------------------
    if (selectedModules.includes('Purchases')) {
      const billsSheet = workbook.addWorksheet('Bills Summary');
      billsSheet.columns = [
        { header: 'Bill ID', key: 'bill_id', width: 18 },
        { header: 'Vendor Ref / Invoice #', key: 'ref', width: 25 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Issue Date', key: 'issue_date', width: 14 },
        { header: 'Due Date', key: 'due_date', width: 14 },
        { header: 'Supplier Name', key: 'supplier_name', width: 28 },
        { header: 'Line Item Summary', key: 'items', width: 45 },
        { header: 'Total Amount (PKR)', key: 'total_amount', width: 20 },
        { header: 'Amount Paid (PKR)', key: 'amount_paid', width: 20 },
        { header: 'Balance Due (PKR)', key: 'balance_due', width: 20 }
      ];

      billsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      billsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };

      const filteredBills = startDate 
        ? bills.filter(b => (b.issue_date || '').split('T')[0] >= startDate)
        : bills;

      filteredBills.forEach(b => {
        const lineItems = (b.bill_lines || [])
          .map((l: any) => l.description || 'Expense Item')
          .filter(Boolean);
        const itemsStr = lineItems.length > 0 ? lineItems.join(', ') : 'Vendor Bill / Purchase';
        const suppName = b.suppliers?.name || 'Unknown Supplier';
        const totalAmount = Number(b.total_amount || 0);
        const amountPaid = Number(b.amount_paid ?? (totalAmount - Number(b.balance_due || 0)));
        const balanceDue = Number(b.balance_due ?? (totalAmount - amountPaid));

        const row = billsSheet.addRow({
          bill_id: formatEntityId('BILL', b),
          ref: b.external_reference || '-',
          status: (b.status || 'PAID').toUpperCase(),
          issue_date: b.issue_date || (b.created_at ? b.created_at.split('T')[0] : '-'),
          due_date: b.due_date || '-',
          supplier_name: suppName,
          items: itemsStr,
          total_amount: totalAmount,
          amount_paid: amountPaid,
          balance_due: balanceDue
        });

        row.getCell('total_amount').numFmt = '#,##0.00';
        row.getCell('amount_paid').numFmt = '#,##0.00';
        row.getCell('balance_due').numFmt = '#,##0.00';
      });

      // Detailed Bill Lines
      const billLinesSheet = workbook.addWorksheet('Bill Line Items');
      billLinesSheet.columns = [
        { header: 'Bill ID', key: 'bill_id', width: 18 },
        { header: 'Supplier Name', key: 'supplier_name', width: 28 },
        { header: 'Line Description / Expense', key: 'description', width: 45 },
        { header: 'GL Expense Account', key: 'account_name', width: 28 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit Cost (PKR)', key: 'unit_price', width: 18 },
        { header: 'Line Total (PKR)', key: 'amount', width: 18 }
      ];
      billLinesSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      billLinesSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };

      filteredBills.forEach(b => {
        const suppName = b.suppliers?.name || 'Unknown Supplier';
        (b.bill_lines || []).forEach((line: any) => {
          const desc = line.description || 'Expense Item';
          const accName = line.accounts?.name || 'General Operating Expense';
          const row = billLinesSheet.addRow({
            bill_id: formatEntityId('BILL', b),
            supplier_name: suppName,
            description: desc,
            account_name: accName,
            quantity: line.quantity || 1,
            unit_price: Number(line.unit_price || line.amount || 0),
            amount: Number(line.amount || 0)
          });
          row.getCell('unit_price').numFmt = '#,##0.00';
          row.getCell('amount').numFmt = '#,##0.00';
        });
      });

      // Suppliers Sheet
      const suppliersSheet = workbook.addWorksheet('Suppliers');
      suppliersSheet.columns = [
        { header: 'Supplier ID', key: 'id', width: 18 },
        { header: 'Supplier Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Total Billed (PKR)', key: 'total_billed', width: 22 },
        { header: 'Outstanding A/P (PKR)', key: 'balance', width: 25 }
      ];
      suppliersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      suppliersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };

      allSuppliers.forEach(s => {
        const suppBills = bills.filter(b => b.supplier_id === s.id);
        const totalBilled = suppBills.reduce((acc, b) => acc + Number(b.total_amount || 0), 0);
        const totalOutstanding = suppBills.reduce((acc, b) => {
          if (b.status !== 'paid' && b.status !== 'PAID') {
            return acc + Number(b.balance_due ?? (Number(b.total_amount || 0) - Number(b.amount_paid || 0)));
          }
          return acc;
        }, 0);

        const row = suppliersSheet.addRow({
          id: formatEntityId('SUPP', s),
          name: s.name,
          email: s.email || '-',
          phone: s.phone || '-',
          total_billed: totalBilled,
          balance: totalOutstanding
        });
        row.getCell('total_billed').numFmt = '#,##0.00';
        row.getCell('balance').numFmt = '#,##0.00';
      });
    }

    // -------------------------------------------------------------
    // SHEET 4: ACCOUNTING & FINANCIAL STATEMENTS
    // -------------------------------------------------------------
    if (selectedModules.includes('Accounting')) {
      // 4.1 CHART OF ACCOUNTS (With Parent/Child Debt Hierarchy)
      const coaSheet = workbook.addWorksheet('Chart of Accounts');
      coaSheet.columns = [
        { header: 'Account Code', key: 'code', width: 16 },
        { header: 'Account Name', key: 'name', width: 35 },
        { header: 'Parent Category / Control Account', key: 'parent_category', width: 32 },
        { header: 'Account Hierarchy', key: 'hierarchy', width: 18 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Liquid Cash', key: 'is_cash', width: 14 },
        { header: 'Total Debits (PKR)', key: 'debits', width: 22 },
        { header: 'Total Credits (PKR)', key: 'credits', width: 22 },
        { header: 'Running Balance (PKR)', key: 'balance', width: 25 }
      ];

      coaSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      coaSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };

      // Group parent control accounts and their sub-accounts
      const parents = accounts.filter(a => !a.parent_account_id && !a.parent_id);
      const children = accounts.filter(a => a.parent_account_id || a.parent_id);

      const orderedAccounts: Array<{ account: any, isSubAccount: boolean, parentName: string }> = [];
      parents.forEach(p => {
        orderedAccounts.push({ account: p, isSubAccount: false, parentName: 'None (Control Account)' });
        const subs = children.filter(c => (c.parent_account_id === p.id || c.parent_id === p.id));
        subs.forEach(s => {
          orderedAccounts.push({ account: s, isSubAccount: true, parentName: p.name });
        });
      });

      // Add any orphaned children
      children.forEach(c => {
        if (!orderedAccounts.find(o => o.account.id === c.id)) {
          const p = accountsMap.get(c.parent_account_id || c.parent_id);
          orderedAccounts.push({ account: c, isSubAccount: true, parentName: p ? p.name : 'Unknown Parent' });
        }
      });

      orderedAccounts.forEach(({ account: acc, isSubAccount, parentName }) => {
        const b = accountBalances.get(acc.id) || { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 };
        const balance = getAccountBalance(acc, false);
        const displayName = isSubAccount ? `   ↳ ${acc.name} (Sub-Account)` : acc.name;
        const hierarchyLabel = isSubAccount ? 'Sub-Account' : (children.some(c => c.parent_account_id === acc.id || c.parent_id === acc.id) ? 'Control Category' : 'Standard Account');

        const row = coaSheet.addRow({
          code: acc.code || '-',
          name: displayName,
          parent_category: parentName,
          hierarchy: hierarchyLabel,
          type: (acc.type || '').toUpperCase(),
          is_cash: (acc.type === 'asset' && acc.is_cash_account) ? 'Yes' : 'No',
          debits: b.debitsCents / 100,
          credits: b.creditsCents / 100,
          balance: balance
        });

        if (hierarchyLabel === 'Control Category') {
          row.font = { bold: true };
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        } else if (isSubAccount) {
          row.getCell('name').font = { italic: true, color: { argb: 'FF1E40AF' } };
        }

        row.getCell('debits').numFmt = '#,##0.00';
        row.getCell('credits').numFmt = '#,##0.00';
        row.getCell('balance').numFmt = '#,##0.00';
      });

      // 4.2 PROFIT & LOSS
      const pnlSheet = workbook.addWorksheet('Profit & Loss');
      pnlSheet.columns = [
        { header: 'Account / Line Item', key: 'item', width: 45 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      pnlSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      pnlSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };

      const revenueAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'revenue');
      const expenseAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'expense');
      const cogsAcc = expenseAccs.find(a => (a.name || '').toLowerCase() === 'cost of goods sold');
      const operatingExpenseAccs = expenseAccs.filter(a => (a.name || '').toLowerCase() !== 'cost of goods sold');

      const totalRev = revenueAccs.reduce((s, a) => s + getAccountBalance(a, true), 0);
      const totalCogs = cogsAcc ? getAccountBalance(cogsAcc, true) : 0;
      const grossProfit = totalRev - totalCogs;
      const totalOperatingExp = operatingExpenseAccs.reduce((s, a) => s + getAccountBalance(a, true), 0);
      const netProfit = grossProfit - totalOperatingExp;

      // REVENUE
      const rHeader = pnlSheet.addRow({ item: 'OPERATING REVENUE' });
      rHeader.font = { bold: true, color: { argb: 'FF15803D' } };
      revenueAccs.forEach(a => {
        const bal = getAccountBalance(a, true);
        const r = pnlSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const rTotal = pnlSheet.addRow({ item: 'Total Operating Revenue', amount: totalRev });
      rTotal.font = { bold: true };
      rTotal.getCell('amount').numFmt = '#,##0.00';

      pnlSheet.addRow([]); // Spacer

      // COGS & GROSS PROFIT
      const cogsHeader = pnlSheet.addRow({ item: 'COST OF GOODS SOLD (COGS)' });
      cogsHeader.font = { bold: true, color: { argb: 'FFB45309' } };
      if (cogsAcc) {
        const r = pnlSheet.addRow({ item: `   ${cogsAcc.name}`, amount: totalCogs });
        r.getCell('amount').numFmt = '#,##0.00';
      }
      const gpRow = pnlSheet.addRow({ item: 'GROSS PROFIT', amount: grossProfit });
      gpRow.font = { bold: true, size: 11, color: { argb: 'FF15803D' } };
      gpRow.getCell('amount').numFmt = '#,##0.00';

      pnlSheet.addRow([]); // Spacer

      // OPERATING EXPENSES
      const expHeader = pnlSheet.addRow({ item: 'OPERATING EXPENSES' });
      expHeader.font = { bold: true, color: { argb: 'FFDC2626' } };
      operatingExpenseAccs.forEach(a => {
        const bal = getAccountBalance(a, true);
        const r = pnlSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const expTotal = pnlSheet.addRow({ item: 'Total Operating Expenses', amount: totalOperatingExp });
      expTotal.font = { bold: true };
      expTotal.getCell('amount').numFmt = '#,##0.00';

      pnlSheet.addRow([]); // Spacer

      // NET PROFIT
      const netRow = pnlSheet.addRow({ item: 'NET INCOME / (LOSS)', amount: netProfit });
      netRow.font = { bold: true, size: 12, color: { argb: netProfit >= 0 ? 'FF15803D' : 'FFDC2626' } };
      netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      netRow.getCell('amount').numFmt = '#,##0.00';

      // 4.3 BALANCE SHEET (With Debt Hierarchy & SME Owner's Equity)
      const bsSheet = workbook.addWorksheet('Balance Sheet');
      bsSheet.columns = [
        { header: 'Account / Financial Classification', key: 'item', width: 45 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      bsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      bsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } };

      const assetAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'asset');
      const liabAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'liability');
      const equityAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'equity');

      const totalAssets = assetAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const totalLiab = liabAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const contributedEquity = equityAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);

      // All-time net income rolls into Owner's Equity (Net Earnings)
      const allTimeRevenue = revenueAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const allTimeExpenses = expenseAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const netIncomeAllTime = allTimeRevenue - allTimeExpenses;
      const totalOwnerEquity = contributedEquity + netIncomeAllTime;
      const totalLiabAndEquity = totalLiab + totalOwnerEquity;

      // ASSETS
      const astHeader = bsSheet.addRow({ item: 'ASSETS' });
      astHeader.font = { bold: true, color: { argb: 'FF0369A1' } };
      assetAccs.forEach(a => {
        const bal = getAccountBalance(a, false);
        const r = bsSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const astTotal = bsSheet.addRow({ item: 'TOTAL ASSETS', amount: totalAssets });
      astTotal.font = { bold: true, size: 11, color: { argb: 'FF0369A1' } };
      astTotal.getCell('amount').numFmt = '#,##0.00';

      bsSheet.addRow([]); // Spacer

      // LIABILITIES WITH DEBT HIERARCHY
      const liabHeader = bsSheet.addRow({ item: 'LIABILITIES' });
      liabHeader.font = { bold: true, color: { argb: 'FFDC2626' } };

      // Split into Short-Term and Long-Term
      const shortTermDebtParent = liabAccs.find(a => a.name === 'Short-Term Debt');
      const longTermDebtParent = liabAccs.find(a => a.name === 'Long-Term Debt');
      const otherLiabilities = liabAccs.filter(a => a.name !== 'Short-Term Debt' && a.name !== 'Long-Term Debt' && !a.parent_account_id && !a.parent_id);

      // Other Current Liabilities
      otherLiabilities.forEach(a => {
        const bal = getAccountBalance(a, false);
        const r = bsSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });

      // Short-Term Debt Hierarchy
      if (shortTermDebtParent) {
        const stSubs = liabAccs.filter(a => a.parent_account_id === shortTermDebtParent.id || a.parent_id === shortTermDebtParent.id);
        const stTotal = getAccountBalance(shortTermDebtParent, false) + stSubs.reduce((sum, s) => sum + getAccountBalance(s, false), 0);
        const stRow = bsSheet.addRow({ item: `   ${shortTermDebtParent.name} (Control Category)`, amount: stTotal });
        stRow.font = { bold: true };
        stRow.getCell('amount').numFmt = '#,##0.00';
        stSubs.forEach(s => {
          const sBal = getAccountBalance(s, false);
          const r = bsSheet.addRow({ item: `      ↳ ${s.name} (Sub-Account)`, amount: sBal });
          r.font = { italic: true, color: { argb: 'FF475569' } };
          r.getCell('amount').numFmt = '#,##0.00';
        });
      }

      // Long-Term Debt Hierarchy
      if (longTermDebtParent) {
        const ltSubs = liabAccs.filter(a => a.parent_account_id === longTermDebtParent.id || a.parent_id === longTermDebtParent.id);
        const ltTotal = getAccountBalance(longTermDebtParent, false) + ltSubs.reduce((sum, s) => sum + getAccountBalance(s, false), 0);
        const ltRow = bsSheet.addRow({ item: `   ${longTermDebtParent.name} (Control Category)`, amount: ltTotal });
        ltRow.font = { bold: true };
        ltRow.getCell('amount').numFmt = '#,##0.00';
        ltSubs.forEach(s => {
          const sBal = getAccountBalance(s, false);
          const r = bsSheet.addRow({ item: `      ↳ ${s.name} (Sub-Account)`, amount: sBal });
          r.font = { italic: true, color: { argb: 'FF475569' } };
          r.getCell('amount').numFmt = '#,##0.00';
        });
      }

      const liabTotal = bsSheet.addRow({ item: 'TOTAL LIABILITIES', amount: totalLiab });
      liabTotal.font = { bold: true };
      liabTotal.getCell('amount').numFmt = '#,##0.00';

      bsSheet.addRow([]); // Spacer

      // SME OWNER'S EQUITY (No Retained Earnings)
      const eqHeader = bsSheet.addRow({ item: "OWNER'S EQUITY (SME)" });
      eqHeader.font = { bold: true, color: { argb: 'FF7C3AED' } };
      equityAccs.forEach(a => {
        const bal = getAccountBalance(a, false);
        const r = bsSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const netEarnRow = bsSheet.addRow({ item: "   Owner's Net Income / Earnings (All-Time)", amount: netIncomeAllTime });
      netEarnRow.getCell('amount').numFmt = '#,##0.00';

      const eqTotal = bsSheet.addRow({ item: "TOTAL OWNER'S EQUITY", amount: totalOwnerEquity });
      eqTotal.font = { bold: true };
      eqTotal.getCell('amount').numFmt = '#,##0.00';

      bsSheet.addRow([]); // Spacer

      // TOTAL LIABILITIES & EQUITY
      const liabEqTotal = bsSheet.addRow({ item: "TOTAL LIABILITIES & OWNER'S EQUITY", amount: totalLiabAndEquity });
      liabEqTotal.font = { bold: true, size: 11, color: { argb: 'FF0369A1' } };
      liabEqTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      liabEqTotal.getCell('amount').numFmt = '#,##0.00';

      // 4.4 TRIAL BALANCE
      const tbSheet = workbook.addWorksheet('Trial Balance');
      tbSheet.columns = [
        { header: 'Account Code', key: 'code', width: 16 },
        { header: 'Account Name', key: 'name', width: 35 },
        { header: 'Category / Parent', key: 'parent_category', width: 28 },
        { header: 'Account Type', key: 'type', width: 18 },
        { header: 'Total Debits (PKR)', key: 'debit', width: 22 },
        { header: 'Total Credits (PKR)', key: 'credit', width: 22 }
      ];
      tbSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      tbSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

      let totalTbDebits = 0;
      let totalTbCredits = 0;

      accounts.forEach(acc => {
        const b = accountBalances.get(acc.id) || { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 };
        const d = b.debitsCents / 100;
        const c = b.creditsCents / 100;
        const parent = (acc.parent_account_id || acc.parent_id) ? accountsMap.get(acc.parent_account_id || acc.parent_id) : null;

        if (d > 0 || c > 0) {
          totalTbDebits += d;
          totalTbCredits += c;

          const row = tbSheet.addRow({
            code: acc.code || '-',
            name: acc.name,
            parent_category: parent ? parent.name : 'Primary Control',
            type: (acc.type || '').toUpperCase(),
            debit: d,
            credit: c
          });
          row.getCell('debit').numFmt = '#,##0.00';
          row.getCell('credit').numFmt = '#,##0.00';
        }
      });

      const tbTotalRow = tbSheet.addRow({
        code: '',
        name: 'TOTALS (BALANCED)',
        parent_category: '',
        type: '',
        debit: totalTbDebits,
        credit: totalTbCredits
      });
      tbTotalRow.font = { bold: true };
      tbTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      tbTotalRow.getCell('debit').numFmt = '#,##0.00';
      tbTotalRow.getCell('credit').numFmt = '#,##0.00';

      // 4.5 GENERAL LEDGER
      const glSheet = workbook.addWorksheet('General Ledger');
      glSheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Description / Particulars', key: 'desc', width: 45 },
        { header: 'Account Code', key: 'account_code', width: 16 },
        { header: 'Account Name', key: 'account_name', width: 30 },
        { header: 'Category / Parent', key: 'parent_category', width: 28 },
        { header: 'Debit (PKR)', key: 'debit', width: 18 },
        { header: 'Credit (PKR)', key: 'credit', width: 18 }
      ];
      glSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      glSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      const filteredJournals = startDate
        ? journalEntries.filter(j => (j.date || '').split('T')[0] >= startDate)
        : journalEntries;

      filteredJournals.forEach(entry => {
        const cleanDesc = sanitizeDescription(entry.description);
        const entryDate = entry.date ? entry.date.split('T')[0] : '-';

        if (entry.journal_lines && Array.isArray(entry.journal_lines)) {
          entry.journal_lines.forEach((line: any) => {
            const acc = line.accounts || accountsMap.get(line.account_id) || {};
            const parent = (acc.parent_account_id || acc.parent_id) ? accountsMap.get(acc.parent_account_id || acc.parent_id) : null;
            const accName = acc.name || 'General Ledger Account';
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);

            const row = glSheet.addRow({
              date: entryDate,
              desc: cleanDesc,
              account_code: acc.code || '-',
              account_name: accName,
              parent_category: parent ? parent.name : 'Primary Control',
              debit: debit > 0 ? debit : 0,
              credit: credit > 0 ? credit : 0
            });

            row.getCell('debit').numFmt = '#,##0.00';
            row.getCell('credit').numFmt = '#,##0.00';
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
        'Content-Disposition': `attachment; filename="Bookkeeper_Export_${new Date().toISOString().split('T')[0]}.xlsx"`
      }
    });
  } catch (error: any) {
    console.error("Export API Fatal Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
