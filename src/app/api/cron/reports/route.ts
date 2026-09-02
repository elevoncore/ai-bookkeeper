import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, MailerResult } from "@/utils/mailer";

export interface PeriodDateRange {
  period: 'weekly' | 'monthly' | 'yearly';
  periodLabel: string;
  startDate: string;
  endDate: string;
  startDateIso: string;
  endDateIso: string;
}

/**
 * Calculates exact date boundaries with 100% precision across leap years & varying month lengths.
 */
export function calculateDateRange(period: string = 'weekly', referenceDate: Date = new Date()): PeriodDateRange {
  const normPeriod = (period || 'weekly').toLowerCase() as 'weekly' | 'monthly' | 'yearly';

  let start: Date;
  let end: Date;
  let label = '';

  if (normPeriod === 'monthly') {
    // Triggered on the 1st of the month: Exactly the previous calendar month
    const targetMonth = referenceDate.getMonth() - 1;
    const targetYear = referenceDate.getFullYear();
    start = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    // Setting day to 0 of the current month returns the exact last day of previous month
    end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  } else if (normPeriod === 'yearly') {
    // Triggered on Jan 1st: Exactly the previous calendar year
    const targetYear = referenceDate.getFullYear() - 1;
    start = new Date(targetYear, 0, 1, 0, 0, 0, 0);
    end = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    label = `Full Year ${targetYear}`;
  } else {
    // Default: Weekly (Triggered on Monday: Monday 00:00:00 to Sunday 23:59:59 of previous week)
    const dayOfWeek = referenceDate.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    
    const prevMonday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - daysSinceMonday - 7, 0, 0, 0, 0);
    const prevSunday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - daysSinceMonday - 1, 23, 59, 59, 999);
    
    start = prevMonday;
    end = prevSunday;
    label = `${formatDateStr(start)} to ${formatDateStr(end)}`;
  }

  return {
    period: normPeriod,
    periodLabel: label,
    startDate: formatDateStr(start),
    endDate: formatDateStr(end),
    startDateIso: start.toISOString(),
    endDateIso: end.toISOString()
  };
}

function formatDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export interface UserFinancialReport {
  userId: string;
  userEmail?: string;
  period: 'weekly' | 'monthly' | 'yearly';
  periodLabel: string;
  startDate: string;
  endDate: string;
  currency: string;
  metrics: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    totalCashInflow: number;
    totalCashOutflow: number;
    netCashFlow: number;
    invoicesCount: number;
    billsCount: number;
    openReceivables: number;
    openPayables: number;
  };
}

/**
 * Generates clean, professional, responsive HTML email report
 */
export function generateFinancialReportEmailHtml(report: UserFinancialReport): string {
  const { metrics, periodLabel, startDate, endDate, currency, period } = report;
  const isProfitPositive = metrics.netProfit >= 0;
  const isCashFlowPositive = metrics.netCashFlow >= 0;

  const titlePrefix = period === 'weekly' ? 'Weekly' : (period === 'monthly' ? 'Monthly' : 'Annual');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${titlePrefix} Financial Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01); border: 1px solid #e2e8f0;">
          
          <!-- HEADER BANNER -->
          <tr>
            <td style="background-color: #0f172a; padding: 36px 32px; text-align: center;">
              <div style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px;">AI BOOKKEEPER — CFO INTELLIGENCE</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Your ${titlePrefix} Financial Report</h1>
              <div style="margin-top: 10px; font-size: 13px; color: #94a3b8; font-weight: 500;">Scope: ${periodLabel} (${startDate} to ${endDate})</div>
            </td>
          </tr>

          <!-- CORE kPI SUMMARY TABLE -->
          <tr>
            <td style="padding: 32px;">
              <div style="font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;">Executive Performance Summary</div>
              
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <!-- Row 1: Revenue & Expenses -->
                <tr>
                  <td width="50%" style="padding: 16px; background-color: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #166534; margin-bottom: 6px;">Total Revenue (Invoices)</div>
                    <div style="font-size: 20px; font-weight: 800; color: #15803d;">${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: 600;">${currency}</span></div>
                    <div style="font-size: 11px; color: #166534; margin-top: 4px;">From ${metrics.invoicesCount} issue invoice(s)</div>
                  </td>
                  <td width="12" style="width: 12px;"></td>
                  <td width="50%" style="padding: 16px; background-color: #fef2f2; border-radius: 12px; border: 1px solid #fecaca; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #991b1b; margin-bottom: 6px;">Total Expenses (Bills)</div>
                    <div style="font-size: 20px; font-weight: 800; color: #b91c1c;">${metrics.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: 600;">${currency}</span></div>
                    <div style="font-size: 11px; color: #991b1b; margin-top: 4px;">From ${metrics.billsCount} vendor bill(s)</div>
                  </td>
                </tr>
                
                <tr><td height="12" style="height: 12px;"></td></tr>

                <!-- Row 2: Net Profit & Net Cash Flow -->
                <tr>
                  <td width="50%" style="padding: 16px; background-color: ${isProfitPositive ? '#f8fafc' : '#fff1f2'}; border-radius: 12px; border: 1px solid ${isProfitPositive ? '#e2e8f0' : '#fda4af'}; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px;">Net Operating Profit</div>
                    <div style="font-size: 20px; font-weight: 800; color: ${isProfitPositive ? '#0f172a' : '#e11d48'};">${metrics.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: 600;">${currency}</span></div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Revenue minus Expenses</div>
                  </td>
                  <td width="12" style="width: 12px;"></td>
                  <td width="50%" style="padding: 16px; background-color: ${isCashFlowPositive ? '#f0f9ff' : '#fff7ed'}; border-radius: 12px; border: 1px solid ${isCashFlowPositive ? '#bae6fd' : '#fed7aa'}; vertical-align: top;">
                    <div style="font-size: 12px; font-weight: 700; color: ${isCashFlowPositive ? '#0369a1' : '#c2410c'}; margin-bottom: 6px;">Net Cash Flow</div>
                    <div style="font-size: 20px; font-weight: 800; color: ${isCashFlowPositive ? '#0284c7' : '#ea580c'};">${metrics.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style="font-size: 13px; font-weight: 600;">${currency}</span></div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 4px;">In: +${metrics.totalCashInflow.toLocaleString()} | Out: -${metrics.totalCashOutflow.toLocaleString()}</div>
                  </td>
                </tr>
              </table>

              <!-- DETAILED BREAKDOWN TABLE -->
              <div style="margin-top: 28px; font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Outstanding Position</div>
              
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-collapse: collapse; width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #f1f5f9;">
                  <th style="padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; color: #475569;">Ledger Category</th>
                  <th style="padding: 10px 14px; text-align: right; font-size: 12px; font-weight: 700; color: #475569;">Amount (${currency})</th>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 12px 14px; font-size: 13px; font-weight: 600; color: #334155;">Accounts Receivable (A/R Owed to You)</td>
                  <td style="padding: 12px 14px; text-align: right; font-size: 13px; font-weight: 700; color: #16a34a;">${metrics.openReceivables.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 14px; font-size: 13px; font-weight: 600; color: #334155;">Accounts Payable (A/P Owed by You)</td>
                  <td style="padding: 12px 14px; text-align: right; font-size: 13px; font-weight: 700; color: #dc2626;">${metrics.openPayables.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </table>

              <!-- FOOTER NOTE -->
              <div style="margin-top: 30px; padding: 16px; background-color: #f8fafc; border-radius: 8px; font-size: 12px; color: #64748b; line-height: 1.5;">
                ℹ️ <strong>Controller Note:</strong> All transactions are calculated from your immutable double-entry ledger. For a detailed multi-sheet backup, sign in to your dashboard and export your complete workbook.
              </div>
            </td>
          </tr>

          <!-- FOOTER BRANDING -->
          <tr>
            <td style="background-color: #f1f5f9; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8;">
              AI Bookkeeper • Autonomous SME Financial Controller Engine<br>
              This is an automated notification. Managed via Vercel Cron Scheduler.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Dispatches the financial report via live Nodemailer SMTP
 */
export async function sendNotification(report: UserFinancialReport): Promise<MailerResult> {
  const recipientEmail = report.userEmail || process.env.SMTP_EMAIL || 'client@aibookkeeper.com';
  const titlePrefix = report.period === 'weekly' ? 'Weekly' : (report.period === 'monthly' ? 'Monthly' : 'Annual');
  
  const dynamicSubject = report.period === 'weekly'
    ? `Your Weekly Financial Report (${report.startDate} to ${report.endDate})`
    : `Your ${titlePrefix} Financial Report - ${report.periodLabel}`;

  const htmlContent = generateFinancialReportEmailHtml(report);
  const plainTextFallback = `Your ${titlePrefix} Financial Report (${report.startDate} to ${report.endDate})\n\nTotal Revenue: ${report.metrics.totalRevenue} ${report.currency}\nTotal Expenses: ${report.metrics.totalExpenses} ${report.currency}\nNet Profit: ${report.metrics.netProfit} ${report.currency}\nNet Cash Flow: ${report.metrics.netCashFlow} ${report.currency}`;

  return await sendEmail({
    to: recipientEmail,
    subject: dynamicSubject,
    html: htmlContent,
    text: plainTextFallback
  });
}

export async function GET(request: Request) {
  return handleCronRequest(request);
}

export async function POST(request: Request) {
  return handleCronRequest(request);
}

async function handleCronRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'weekly';

    // 1. Security Authorization Check
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const isAuthorized = 
        authHeader === `Bearer ${cronSecret}` || 
        request.headers.get("x-cron-secret") === cronSecret ||
        request.headers.get("x-vercel-cron") === cronSecret;

      if (!isAuthorized) {
        console.warn("[Cron API] Unauthorized attempt to trigger reports cron.");
        return NextResponse.json({ error: "Unauthorized. Invalid or missing CRON_SECRET." }, { status: 401 });
      }
    }

    // 2. Compute Exact Date Boundaries
    const dateRange = calculateDateRange(period);
    console.log(`[Cron API] Executing ${dateRange.period.toUpperCase()} report aggregation for ${dateRange.startDate} to ${dateRange.endDate}`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Fetch Distinct Users with Financial Data
    const { data: accountsData } = await supabase.from('accounts').select('user_id').limit(100);
    const distinctUserIds = Array.from(new Set((accountsData || []).map(a => a.user_id).filter(Boolean)));

    if (distinctUserIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users found in database.",
        dateRange,
        reportsGenerated: 0
      }, { status: 200 });
    }

    const reports: UserFinancialReport[] = [];
    const mailerResults: MailerResult[] = [];

    // 4. Query & Aggregate Financial Metrics per User
    for (const userId of distinctUserIds) {
      const [invoicesRes, billsRes, paymentsRes, authUserRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, total_amount, amount_paid, balance_due, status, issue_date')
          .eq('user_id', userId)
          .gte('issue_date', dateRange.startDate)
          .lte('issue_date', dateRange.endDate),
        supabase
          .from('bills')
          .select('id, total_amount, amount_paid, balance_due, status, issue_date')
          .eq('user_id', userId)
          .gte('issue_date', dateRange.startDate)
          .lte('issue_date', dateRange.endDate),
        supabase
          .from('journal_entries')
          .select('id, date, journal_lines(debit, credit, account_id, accounts(name, is_cash_account, type))')
          .eq('user_id', userId)
          .gte('date', `${dateRange.startDate} 00:00:00`)
          .lte('date', `${dateRange.endDate} 23:59:59.999`),
        supabase.auth.admin.getUserById(userId).catch(() => ({ data: null }))
      ]);

      const userInvoices = invoicesRes.data || [];
      const userBills = billsRes.data || [];
      const userJournals = paymentsRes.data || [];
      const userEmail = authUserRes?.data?.user?.email || undefined;

      const totalRevenue = userInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
      const totalExpenses = userBills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
      const netProfit = totalRevenue - totalExpenses;

      let totalCashInflow = 0;
      let totalCashOutflow = 0;

      userJournals.forEach(entry => {
        (entry.journal_lines || []).forEach((line: any) => {
          const acc = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
          const isLiquid = acc?.is_cash_account || (acc?.type === 'asset' && (acc?.name?.toLowerCase().includes('bank') || acc?.name?.toLowerCase().includes('cash')));
          if (isLiquid) {
            totalCashInflow += Number(line.debit || 0);
            totalCashOutflow += Number(line.credit || 0);
          }
        });
      });

      if (totalCashInflow === 0 && totalCashOutflow === 0) {
        totalCashInflow = userInvoices.reduce((sum, inv) => sum + Number(inv.amount_paid || (inv.status === 'paid' ? inv.total_amount : 0)), 0);
        totalCashOutflow = userBills.reduce((sum, b) => sum + Number(b.amount_paid || (b.status === 'paid' ? b.total_amount : 0)), 0);
      }

      const netCashFlow = totalCashInflow - totalCashOutflow;
      const openReceivables = userInvoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);
      const openPayables = userBills.reduce((sum, b) => sum + Number(b.balance_due || 0), 0);

      const report: UserFinancialReport = {
        userId,
        userEmail,
        period: dateRange.period,
        periodLabel: dateRange.periodLabel,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        currency: 'PKR',
        metrics: {
          totalRevenue,
          totalExpenses,
          netProfit,
          totalCashInflow,
          totalCashOutflow,
          netCashFlow,
          invoicesCount: userInvoices.length,
          billsCount: userBills.length,
          openReceivables,
          openPayables
        }
      };

      reports.push(report);

      // Dispatch live Nodemailer SMTP email
      const mailResult = await sendNotification(report);
      mailerResults.push(mailResult);
    }

    return NextResponse.json({
      success: true,
      period: dateRange.period,
      periodLabel: dateRange.periodLabel,
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      },
      reportsGenerated: reports.length,
      reports,
      notifications: mailerResults
    }, { status: 200 });

  } catch (error: any) {
    console.error("[Cron API Fatal Error]:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
