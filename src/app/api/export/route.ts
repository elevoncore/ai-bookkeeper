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

    // Fallback for Bearer token in Authorization header (for test scripts / automation)
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

    const { timeframe = 'all', selectedModules = ['Overview', 'Sales', 'Purchases', 'Accounting'] } = await request.json();

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
    const [accountsRes, journalsRes, invoicesRes, billsRes] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id).order('name', { ascending: true }),
      supabase.from('journal_entries').select('*, journal_lines(*, accounts(name, type))').eq('user_id', user.id).order('date', { ascending: false }),
      supabase.from('invoices').select('*, customers(id, name, email, phone), invoice_lines(description, quantity, total, products(name, cost))').eq('user_id', user.id).order('issue_date', { ascending: false }),
      supabase.from('bills').select('*, suppliers(id, name, email, phone), bill_lines(description, quantity, amount, unit_price)').eq('user_id', user.id).order('issue_date', { ascending: false })
    ]);

    const accounts = accountsRes.data || [];
    const journalEntries = journalsRes.data || [];
    const invoices = invoicesRes.data || [];
    const bills = billsRes.data || [];

    // Helper map for accounts
    const accountsMap = new Map<string, any>();
    accounts.forEach(acc => accountsMap.set(acc.id, acc));

    // 2. MATHEMATICAL AGGREGATIONS (DEBIT & CREDIT PARSING)
    // Structure: cents-based calculations to eliminate floating point issues
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

    // Helper to format raw descriptions (replace raw UUIDs with human-readable entity references)
    function sanitizeDescription(desc: string | null | undefined): string {
      if (!desc) return '-';
      return desc.replace(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi, (match) => {
        return match.substring(0, 6).toUpperCase();
      });
    }

    // 3. INITIALIZE EXCEL WORKBOOK
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Bookkeeper';
    workbook.created = new Date();

    // -------------------------------------------------------------
    // SHEET 1: OVERVIEW DASHBOARD (Advanced Visual Dashboard)
    // -------------------------------------------------------------
    if (selectedModules.includes('Overview')) {
      const overviewSheet = workbook.addWorksheet('Overview', {
        views: [{ showGridLines: true }]
      });

      overviewSheet.columns = [
        { key: 'colA', width: 32 },
        { key: 'colB', width: 24 },
        { key: 'colC', width: 6 },
        { key: 'colD', width: 32 },
        { key: 'colE', width: 24 }
      ];

      // Banner Header
      overviewSheet.mergeCells('A1:E2');
      const titleCell = overviewSheet.getCell('A1');
      titleCell.value = 'AI BOOKKEEPER — EXECUTIVE FINANCIAL DASHBOARD';
      titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Slate 800
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

      const cashAccounts = accounts.filter(a => {
        if ((a.type || '').toLowerCase() !== 'asset') return false;
        if (a.is_cash_account) return true;
        const name = (a.name || '').toLowerCase();
        return name.includes('bank') || name.includes('cash') || name.includes('wallet') || name.includes('petty');
      });
      const totalLiquidCash = cashAccounts.reduce((sum, a) => sum + getAccountBalance(a, false), 0);

      // AR / AP Calculations
      const arAccount = accounts.find(a => (a.name || '').toLowerCase().includes('accounts receivable'));
      const apAccount = accounts.find(a => (a.name || '').toLowerCase().includes('accounts payable'));
      
      // Compute from unpaid invoices / bills for exact consistency with UI
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

      const totalAR = arAccount ? Math.max(getAccountBalance(arAccount, false), totalARInvoices) : totalARInvoices;
      const totalAP = apAccount ? Math.max(getAccountBalance(apAccount, false), totalAPBills) : totalAPBills;

      // Section 1 Header
      overviewSheet.addRow([]); // Row 4 spacer
      const row5 = overviewSheet.addRow(['PROFIT & LOSS SUMMARY (PERIOD)', '', '', 'BALANCE & LIQUIDITY (ALL-TIME)', '']);
      row5.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      overviewSheet.getCell('A5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue 600
      overviewSheet.getCell('B5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      overviewSheet.getCell('D5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal 600
      overviewSheet.getCell('E5').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

      // Row 6: Revenue & Cash
      const row6 = overviewSheet.addRow(['Total Operating Revenue', totalRevenuePeriod, '', 'Total Liquid Cash Reserves', totalLiquidCash]);
      overviewSheet.getCell('A6').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('B6').font = { bold: true, size: 12, color: { argb: 'FF16A34A' } };
      overviewSheet.getCell('B6').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D6').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('E6').font = { bold: true, size: 12, color: { argb: 'FF0284C7' } };
      overviewSheet.getCell('E6').numFmt = '#,##0.00 "PKR"';

      // Row 7: Expenses & AR
      const row7 = overviewSheet.addRow(['Total Operating Expenses', totalExpensesPeriod, '', 'Accounts Receivable (A/R Owed to You)', totalAR]);
      overviewSheet.getCell('A7').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('B7').font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
      overviewSheet.getCell('B7').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D7').font = { bold: true, color: { argb: 'FF334155' } };
      overviewSheet.getCell('E7').font = { bold: true, size: 12, color: { argb: 'FF059669' } };
      overviewSheet.getCell('E7').numFmt = '#,##0.00 "PKR"';

      // Row 8: Net Profit & AP
      const row8 = overviewSheet.addRow(['Net Profit / (Loss)', netProfitPeriod, '', 'Accounts Payable (A/P Owed by You)', totalAP]);
      overviewSheet.getCell('A8').font = { bold: true, color: { argb: 'FF0F172A' } };
      overviewSheet.getCell('B8').font = { bold: true, size: 13, color: { argb: netProfitPeriod >= 0 ? 'FF16A34A' : 'FFDC2626' } };
      overviewSheet.getCell('B8').numFmt = '#,##0.00 "PKR"';
      overviewSheet.getCell('D8').font = { bold: true, color: { argb: 'FF0F172A' } };
      overviewSheet.getCell('E8').font = { bold: true, size: 12, color: { argb: 'FFE11D48' } };
      overviewSheet.getCell('E8').numFmt = '#,##0.00 "PKR"';

      // Section 2: A/R & A/P Aging Analysis
      overviewSheet.addRow([]); // Row 9
      const row10 = overviewSheet.addRow(['A/R & A/P AGING BREAKDOWN', '', '', '', '']);
      overviewSheet.mergeCells('A10:E10');
      overviewSheet.getCell('A10').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      overviewSheet.getCell('A10').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };

      const row11 = overviewSheet.addRow(['Aging Bracket', 'A/R (Receivables)', '', 'Aging Bracket', 'A/P (Payables)']);
      row11.font = { bold: true, color: { argb: 'FF475569' } };

      // Calculate Buckets
      function calculateAgingBuckets(items: any[]) {
        const buckets = { current: 0, d1To30: 0, d31To60: 0, dOver60: 0, total: 0 };
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const item of items) {
          const balance = Number(item.balance_due ?? (Number(item.total_amount || 0) - Number(item.amount_paid || 0)));
          if (balance > 0 && item.status !== 'draft') {
            buckets.total += balance;
            if (!item.due_date) {
              buckets.current += balance;
              continue;
            }
            const dueDate = new Date(item.due_date);
            const diffDays = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) buckets.current += balance;
            else if (diffDays <= 30) buckets.d1To30 += balance;
            else if (diffDays <= 60) buckets.d31To60 += balance;
            else buckets.dOver60 += balance;
          }
        }
        return buckets;
      }

      const arBuckets = calculateAgingBuckets(invoices);
      const apBuckets = calculateAgingBuckets(bills);

      const agingRows = [
        ['Current (Not Overdue)', arBuckets.current, '', 'Current (Not Overdue)', apBuckets.current],
        ['1-30 Days Overdue', arBuckets.d1To30, '', '1-30 Days Overdue', apBuckets.d1To30],
        ['31-60 Days Overdue', arBuckets.d31To60, '', '31-60 Days Overdue', apBuckets.d31To60],
        ['60+ Days Overdue (Critical)', arBuckets.dOver60, '', '60+ Days Overdue (Critical)', apBuckets.dOver60],
        ['Total Outstanding A/R', arBuckets.total, '', 'Total Outstanding A/P', apBuckets.total]
      ];

      agingRows.forEach((r, idx) => {
        const added = overviewSheet.addRow(r);
        const isTotal = idx === agingRows.length - 1;
        if (isTotal) {
          added.font = { bold: true };
          overviewSheet.getCell(`A${added.number}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          overviewSheet.getCell(`B${added.number}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          overviewSheet.getCell(`D${added.number}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          overviewSheet.getCell(`E${added.number}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        }
        overviewSheet.getCell(`B${added.number}`).numFmt = '#,##0.00 "PKR"';
        overviewSheet.getCell(`E${added.number}`).numFmt = '#,##0.00 "PKR"';
      });
    }

    // -------------------------------------------------------------
    // SHEET 2: SALES MODULE (Invoices & Customers)
    // -------------------------------------------------------------
    if (selectedModules.includes('Sales')) {
      const invoicesSheet = workbook.addWorksheet('Invoices');
      invoicesSheet.columns = [
        { header: 'Invoice ID', key: 'invoice_id', width: 18 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Issue Date', key: 'issue_date', width: 14 },
        { header: 'Due Date', key: 'due_date', width: 14 },
        { header: 'Customer Name', key: 'customer_name', width: 28 },
        { header: 'Products / Items', key: 'items', width: 45 },
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
        // Collect line items
        const lineItems = (inv.invoice_lines || [])
          .map((l: any) => l.description || l.products?.name || 'Item')
          .filter(Boolean);
        const itemsStr = lineItems.length > 0 ? lineItems.join(', ') : 'Invoice Services/Goods';

        const custName = inv.customers?.name || (inv.customer_id === 'CUST-WALKIN' ? 'Walk-in Customer' : 'Walk-in Customer');
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

      // Customers Tab
      const customersSheet = workbook.addWorksheet('Customers');
      customersSheet.columns = [
        { header: 'Customer ID', key: 'id', width: 18 },
        { header: 'Customer Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Total Invoiced (PKR)', key: 'total_invoiced', width: 22 },
        { header: 'Outstanding Balance (PKR)', key: 'balance', width: 25 }
      ];
      customersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      customersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

      const { data: allCustomers } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name', { ascending: true });
      (allCustomers || []).forEach(c => {
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
    // SHEET 3: PURCHASES MODULE (Bills & Suppliers)
    // -------------------------------------------------------------
    if (selectedModules.includes('Purchases')) {
      const billsSheet = workbook.addWorksheet('Bills');
      billsSheet.columns = [
        { header: 'Bill ID', key: 'bill_id', width: 18 },
        { header: 'Vendor Ref / Invoice #', key: 'ref', width: 25 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Issue Date', key: 'issue_date', width: 14 },
        { header: 'Due Date', key: 'due_date', width: 14 },
        { header: 'Supplier Name', key: 'supplier_name', width: 28 },
        { header: 'Purchased Items / Expense', key: 'items', width: 45 },
        { header: 'Total Amount (PKR)', key: 'total_amount', width: 20 },
        { header: 'Amount Paid (PKR)', key: 'amount_paid', width: 20 },
        { header: 'Balance Due (PKR)', key: 'balance_due', width: 20 }
      ];

      billsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      billsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }; // Indigo 700

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

      // Suppliers Tab
      const suppliersSheet = workbook.addWorksheet('Suppliers');
      suppliersSheet.columns = [
        { header: 'Supplier ID', key: 'id', width: 18 },
        { header: 'Supplier Name', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Total Billed (PKR)', key: 'total_billed', width: 22 },
        { header: 'Outstanding Balance (PKR)', key: 'balance', width: 25 }
      ];
      suppliersSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      suppliersSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };

      const { data: allSuppliers } = await supabase.from('suppliers').select('*').eq('user_id', user.id).order('name', { ascending: true });
      (allSuppliers || []).forEach(s => {
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
      // 4.1 CHART OF ACCOUNTS (With Verified Running Balances)
      const coaSheet = workbook.addWorksheet('Chart of Accounts');
      coaSheet.columns = [
        { header: 'Account Name', key: 'name', width: 32 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'System Protected', key: 'is_system', width: 18 },
        { header: 'Is Cash Account', key: 'is_cash', width: 18 },
        { header: 'Total Debits (PKR)', key: 'debits', width: 22 },
        { header: 'Total Credits (PKR)', key: 'credits', width: 22 },
        { header: 'Running Balance (PKR)', key: 'balance', width: 25 }
      ];

      coaSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      coaSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal 700

      accounts.forEach(acc => {
        const b = accountBalances.get(acc.id) || { debitsCents: 0, creditsCents: 0, periodDebitsCents: 0, periodCreditsCents: 0 };
        const balance = getAccountBalance(acc, false);
        const typeStr = (acc.type || '').toUpperCase();

        const row = coaSheet.addRow({
          name: acc.name,
          type: typeStr,
          is_system: acc.is_system ? 'Yes' : 'No',
          is_cash: acc.is_cash_account ? 'Yes' : 'No',
          debits: b.debitsCents / 100,
          credits: b.creditsCents / 100,
          balance: balance
        });

        row.getCell('debits').numFmt = '#,##0.00';
        row.getCell('credits').numFmt = '#,##0.00';
        row.getCell('balance').numFmt = '#,##0.00';
      });

      // 4.2 PROFIT & LOSS (Detailed Financial Subsections)
      const pnlSheet = workbook.addWorksheet('Profit & Loss');
      pnlSheet.columns = [
        { header: 'Line Item / Account Name', key: 'item', width: 42 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      pnlSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      pnlSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } }; // Green 700

      const revenueAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'revenue');
      const expenseAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'expense');

      const cogsAcc = expenseAccs.find(a => (a.name || '').toLowerCase() === 'cost of goods sold');
      const operatingExpenseAccs = expenseAccs.filter(a => (a.name || '').toLowerCase() !== 'cost of goods sold');

      const totalRev = revenueAccs.reduce((s, a) => s + getAccountBalance(a, true), 0);
      const totalCogs = cogsAcc ? getAccountBalance(cogsAcc, true) : 0;
      const grossProfit = totalRev - totalCogs;
      const totalOperatingExp = operatingExpenseAccs.reduce((s, a) => s + getAccountBalance(a, true), 0);
      const netProfit = grossProfit - totalOperatingExp;

      // REVENUE SECTION
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

      // OPERATING EXPENSES SECTION
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

      // NET PROFIT SECTION
      const netRow = pnlSheet.addRow({ item: 'NET INCOME / (LOSS)', amount: netProfit });
      netRow.font = { bold: true, size: 12, color: { argb: netProfit >= 0 ? 'FF15803D' : 'FFDC2626' } };
      netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      netRow.getCell('amount').numFmt = '#,##0.00';

      // 4.3 BALANCE SHEET (Certified Equation: Assets = Liabilities + Equity)
      const bsSheet = workbook.addWorksheet('Balance Sheet');
      bsSheet.columns = [
        { header: 'Line Item / Account Name', key: 'item', width: 42 },
        { header: 'Amount (PKR)', key: 'amount', width: 25 }
      ];
      bsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      bsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0369A1' } }; // Sky 700

      const assetAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'asset');
      const liabAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'liability');
      const equityAccs = accounts.filter(a => (a.type || '').toLowerCase() === 'equity' && !a.name.toLowerCase().includes('retained earnings'));

      const totalAssets = assetAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const totalLiab = liabAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const contributedEquity = equityAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);

      // All-time net income rolls into Retained Earnings
      const allTimeRevenue = revenueAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const allTimeExpenses = expenseAccs.reduce((s, a) => s + getAccountBalance(a, false), 0);
      const retainedEarnings = allTimeRevenue - allTimeExpenses;
      const totalEquity = contributedEquity + retainedEarnings;
      const totalLiabAndEquity = totalLiab + totalEquity;

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

      // LIABILITIES
      const liabHeader = bsSheet.addRow({ item: 'LIABILITIES' });
      liabHeader.font = { bold: true, color: { argb: 'FFDC2626' } };
      liabAccs.forEach(a => {
        const bal = getAccountBalance(a, false);
        const r = bsSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const liabTotal = bsSheet.addRow({ item: 'TOTAL LIABILITIES', amount: totalLiab });
      liabTotal.font = { bold: true };
      liabTotal.getCell('amount').numFmt = '#,##0.00';

      bsSheet.addRow([]); // Spacer

      // EQUITY
      const eqHeader = bsSheet.addRow({ item: 'EQUITY' });
      eqHeader.font = { bold: true, color: { argb: 'FF7C3AED' } };
      equityAccs.forEach(a => {
        const bal = getAccountBalance(a, false);
        const r = bsSheet.addRow({ item: `   ${a.name}`, amount: bal });
        r.getCell('amount').numFmt = '#,##0.00';
      });
      const retRow = bsSheet.addRow({ item: '   Retained Earnings (All-Time Net Income)', amount: retainedEarnings });
      retRow.getCell('amount').numFmt = '#,##0.00';

      const eqTotal = bsSheet.addRow({ item: 'TOTAL EQUITY', amount: totalEquity });
      eqTotal.font = { bold: true };
      eqTotal.getCell('amount').numFmt = '#,##0.00';

      bsSheet.addRow([]); // Spacer

      // TOTAL LIABILITIES & EQUITY
      const liabEqTotal = bsSheet.addRow({ item: 'TOTAL LIABILITIES & EQUITY', amount: totalLiabAndEquity });
      liabEqTotal.font = { bold: true, size: 11, color: { argb: 'FF0369A1' } };
      liabEqTotal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      liabEqTotal.getCell('amount').numFmt = '#,##0.00';

      // 4.4 TRIAL BALANCE
      const tbSheet = workbook.addWorksheet('Trial Balance');
      tbSheet.columns = [
        { header: 'Account Name', key: 'name', width: 35 },
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

        if (d > 0 || c > 0) {
          totalTbDebits += d;
          totalTbCredits += c;

          const row = tbSheet.addRow({
            name: acc.name,
            type: (acc.type || '').toUpperCase(),
            debit: d,
            credit: c
          });
          row.getCell('debit').numFmt = '#,##0.00';
          row.getCell('credit').numFmt = '#,##0.00';
        }
      });

      const tbTotalRow = tbSheet.addRow({
        name: 'TOTALS (BALANCED)',
        type: '',
        debit: totalTbDebits,
        credit: totalTbCredits
      });
      tbTotalRow.font = { bold: true };
      tbTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      tbTotalRow.getCell('debit').numFmt = '#,##0.00';
      tbTotalRow.getCell('credit').numFmt = '#,##0.00';

      // 4.5 GENERAL LEDGER (All Journal Lines with Clean Names & Formatted Amounts)
      const glSheet = workbook.addWorksheet('General Ledger');
      glSheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Description / Particulars', key: 'desc', width: 45 },
        { header: 'Account Name', key: 'account_name', width: 30 },
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
            const accName = line.accounts?.name || accountsMap.get(line.account_id)?.name || 'General Ledger Account';
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);

            const row = glSheet.addRow({
              date: entryDate,
              desc: cleanDesc,
              account_name: accName,
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
