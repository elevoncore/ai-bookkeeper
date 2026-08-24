import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import ExcelJS from "exceljs";

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
    if (timeframe === '7d') {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeframe === '30d') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (timeframe === '1y') {
      startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Bookkeeper';
    workbook.created = new Date();

    // -- MODULE: SALES --
    if (selectedModules.includes('Sales')) {
      const invoicesSheet = workbook.addWorksheet('Invoices');
      invoicesSheet.columns = [
        { header: 'Invoice Number', key: 'invoice_number', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Due Date', key: 'due_date', width: 15 },
        { header: 'Customer', key: 'customer_name', width: 25 },
        { header: 'Total Amount', key: 'total_amount', width: 15 },
        { header: 'Amount Paid', key: 'amount_paid', width: 15 }
      ];
      // Make headers bold
      invoicesSheet.getRow(1).font = { bold: true };

      let query = supabase.from('invoices').select('*, customers(name)').eq('user_id', user.id).order('date', { ascending: false });
      if (startDate) query = query.gte('date', startDate);
      
      const { data: invoices } = await query;
      if (invoices) {
        invoices.forEach(inv => {
          invoicesSheet.addRow({
            invoice_number: inv.invoice_number,
            status: inv.status,
            date: inv.date,
            due_date: inv.due_date,
            customer_name: inv.customers?.name || 'Walk-in Customer',
            total_amount: inv.total_amount,
            amount_paid: inv.amount_paid
          });
        });
      }
      
      const customersSheet = workbook.addWorksheet('Customers');
      customersSheet.columns = [
        { header: 'Customer Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 20 },
        { header: 'Created At', key: 'created_at', width: 20 }
      ];
      customersSheet.getRow(1).font = { bold: true };
      
      const { data: customers } = await supabase.from('customers').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (customers) {
        customers.forEach(cust => {
          customersSheet.addRow(cust);
        });
      }
    }

    // -- MODULE: PURCHASES --
    if (selectedModules.includes('Purchases')) {
      const billsSheet = workbook.addWorksheet('Bills');
      billsSheet.columns = [
        { header: 'Bill Number', key: 'bill_number', width: 20 },
        { header: 'Reference', key: 'external_reference', width: 20 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Vendor', key: 'vendor_name', width: 25 },
        { header: 'Total Amount', key: 'total_amount', width: 15 },
        { header: 'Amount Paid', key: 'amount_paid', width: 15 }
      ];
      billsSheet.getRow(1).font = { bold: true };

      let query = supabase.from('bills').select('*, vendors(name)').eq('user_id', user.id).order('date', { ascending: false });
      if (startDate) query = query.gte('date', startDate);
      
      const { data: bills } = await query;
      if (bills) {
        bills.forEach(bill => {
          billsSheet.addRow({
            ...bill,
            vendor_name: bill.vendors?.name || 'Unknown Vendor'
          });
        });
      }
      
      const vendorsSheet = workbook.addWorksheet('Vendors');
      vendorsSheet.columns = [
        { header: 'Vendor Name', key: 'name', width: 25 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 20 }
      ];
      vendorsSheet.getRow(1).font = { bold: true };
      
      const { data: vendors } = await supabase.from('vendors').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (vendors) {
        vendors.forEach(ven => vendorsSheet.addRow(ven));
      }
    }

    // -- MODULE: ACCOUNTING --
    if (selectedModules.includes('Accounting')) {
      const accountsSheet = workbook.addWorksheet('Chart of Accounts');
      accountsSheet.columns = [
        { header: 'Account Name', key: 'name', width: 30 },
        { header: 'Type', key: 'type', width: 15 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Description', key: 'description', width: 35 }
      ];
      accountsSheet.getRow(1).font = { bold: true };

      const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', user.id).order('type', { ascending: true });
      if (accounts) {
        accounts.forEach(acc => accountsSheet.addRow(acc));
      }

      const journalSheet = workbook.addWorksheet('Journal Entries');
      journalSheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'Account', key: 'account_name', width: 25 },
        { header: 'Debit', key: 'debit', width: 15 },
        { header: 'Credit', key: 'credit', width: 15 }
      ];
      journalSheet.getRow(1).font = { bold: true };

      let jQuery = supabase.from('journal_entries').select('*, journal_lines(*, accounts(name))').eq('user_id', user.id).order('date', { ascending: false });
      if (startDate) jQuery = jQuery.gte('date', startDate);
      
      const { data: journals } = await jQuery;
      if (journals) {
        journals.forEach(entry => {
          if (entry.journal_lines) {
            entry.journal_lines.forEach((line: any) => {
              journalSheet.addRow({
                date: entry.date,
                description: entry.description,
                account_name: line.accounts?.name || 'Unknown',
                debit: line.is_debit ? line.amount : 0,
                credit: !line.is_debit ? line.amount : 0
              });
            });
          }
        });
      }
    }
    
    // -- MODULE: OVERVIEW --
    if (selectedModules.includes('Overview') && !workbook.worksheets.length) {
      // If only overview is selected and no other sheets, we need at least one sheet
      const infoSheet = workbook.addWorksheet('Overview');
      infoSheet.addRow(['Export Date', new Date().toISOString()]);
      infoSheet.addRow(['Timeframe', timeframe]);
      infoSheet.addRow(['Modules Included', selectedModules.join(', ')]);
      infoSheet.getColumn(1).width = 20;
      infoSheet.getColumn(2).width = 40;
    } else if (selectedModules.includes('Overview') && workbook.worksheets.length > 0) {
       const infoSheet = workbook.addWorksheet('Overview');
       infoSheet.addRow(['Export Date', new Date().toISOString()]);
       infoSheet.addRow(['Timeframe', timeframe]);
       infoSheet.addRow(['Modules Included', selectedModules.join(', ')]);
       infoSheet.getColumn(1).width = 20;
       infoSheet.getColumn(2).width = 40;
       // move Overview to first position
       workbook.worksheets.unshift(workbook.worksheets.pop()!);
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
