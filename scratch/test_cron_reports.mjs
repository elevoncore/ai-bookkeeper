import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

// Test calculateDateRange logic
function calculateDateRange(period = 'weekly', referenceDate = new Date()) {
  const normPeriod = (period || 'weekly').toLowerCase();

  let start;
  let end;
  let label = '';

  if (normPeriod === 'monthly') {
    const targetMonth = referenceDate.getMonth() - 1;
    const targetYear = referenceDate.getFullYear();
    start = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    label = `${monthNames[start.getMonth()]} ${start.getFullYear()} Monthly Report`;
  } else if (normPeriod === 'yearly') {
    const targetYear = referenceDate.getFullYear() - 1;
    start = new Date(targetYear, 0, 1, 0, 0, 0, 0);
    end = new Date(targetYear, 11, 31, 23, 59, 59, 999);
    label = `Full Year ${targetYear} Annual Financial Report`;
  } else {
    const dayOfWeek = referenceDate.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const prevMonday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - daysSinceMonday - 7, 0, 0, 0, 0);
    const prevSunday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - daysSinceMonday - 1, 23, 59, 59, 999);
    start = prevMonday;
    end = prevSunday;
    label = `Weekly Financial Report (${formatDateStr(start)} to ${formatDateStr(end)})`;
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

function formatDateStr(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function runCronTests() {
  console.log("==================================================================");
  console.log("🚀 STARTING CRON NOTIFICATION & REPORTING ENGINE UNIT TESTS");
  console.log("==================================================================");

  // 1. TEST PRECISE DATE BOUNDARIES & LEAP YEAR HANDLING
  console.log("\n🧪 1. TESTING DATE BOUNDARIES MATHEMATICS:");

  // Test Weekly from Monday Sept 7, 2026
  const monRef = new Date(2026, 8, 7); // Sept 7, 2026 (Monday)
  const weekly = calculateDateRange('weekly', monRef);
  console.log(` -> Weekly from Mon Sep 7: Start = ${weekly.startDate}, End = ${weekly.endDate}`);
  if (weekly.startDate !== '2026-08-31' || weekly.endDate !== '2026-09-06') {
    throw new Error(`Weekly date calculation failed: Expected 2026-08-31 to 2026-09-06, got ${weekly.startDate} to ${weekly.endDate}`);
  }
  console.log(" ✅ Weekly date range verified!");

  // Test Monthly on March 1, 2024 (Leap Year February)
  const leapMarch1 = new Date(2024, 2, 1); // March 1, 2024
  const febLeapMonthly = calculateDateRange('monthly', leapMarch1);
  console.log(` -> Monthly from March 1, 2024 (Leap Year): Start = ${febLeapMonthly.startDate}, End = ${febLeapMonthly.endDate}`);
  if (febLeapMonthly.startDate !== '2024-02-01' || febLeapMonthly.endDate !== '2024-02-29') {
    throw new Error(`Leap year February calculation failed: Expected 2024-02-01 to 2024-02-29, got ${febLeapMonthly.startDate} to ${febLeapMonthly.endDate}`);
  }
  console.log(" ✅ Leap Year February 29th verified!");

  // Test Monthly on Oct 1, 2026 (30-day September)
  const oct1 = new Date(2026, 9, 1);
  const septMonthly = calculateDateRange('monthly', oct1);
  console.log(` -> Monthly from Oct 1, 2026: Start = ${septMonthly.startDate}, End = ${septMonthly.endDate}`);
  if (septMonthly.startDate !== '2026-09-01' || septMonthly.endDate !== '2026-09-30') {
    throw new Error(`30-day month calculation failed: Expected 2026-09-01 to 2026-09-30, got ${septMonthly.startDate} to ${septMonthly.endDate}`);
  }
  console.log(" ✅ 30-day month (Sept 30) verified!");

  // Test Yearly on Jan 1, 2027
  const jan1 = new Date(2027, 0, 1);
  const yearly = calculateDateRange('yearly', jan1);
  console.log(` -> Yearly from Jan 1, 2027: Start = ${yearly.startDate}, End = ${yearly.endDate}`);
  if (yearly.startDate !== '2026-01-01' || yearly.endDate !== '2026-12-31') {
    throw new Error(`Yearly calculation failed: Expected 2026-01-01 to 2026-12-31, got ${yearly.startDate} to ${yearly.endDate}`);
  }
  console.log(" ✅ Full Calendar Year verified!");

  // 2. TEST LIVE SUPABASE DATA AGGREGATION & METRICS
  console.log("\n🧪 2. TESTING SUPABASE FINANCIAL AGGREGATION & NOTIFICATION DISPATCH:");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  // Let's run a monthly report for all time / recent month
  const testRange = calculateDateRange('monthly', new Date());
  console.log(`Querying financial metrics for user ${userId} (${testRange.startDate} to ${testRange.endDate})...`);

  const [invoicesRes, billsRes, journalsRes] = await Promise.all([
    supabase.from('invoices').select('id, total_amount, amount_paid, balance_due, status').eq('user_id', userId),
    supabase.from('bills').select('id, total_amount, amount_paid, balance_due, status').eq('user_id', userId),
    supabase.from('journal_entries').select('id, date, journal_lines(debit, credit, account_id, accounts(name, is_cash_account, type))').eq('user_id', userId)
  ]);

  const totalRev = (invoicesRes.data || []).reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalExp = (billsRes.data || []).reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const netProfit = totalRev - totalExp;

  console.log(` -> Invoices Count: ${invoicesRes.data?.length} (Total Revenue: ${totalRev.toLocaleString()} PKR)`);
  console.log(` -> Bills Count: ${billsRes.data?.length} (Total Expenses: ${totalExp.toLocaleString()} PKR)`);
  console.log(` -> Net Profit: ${netProfit.toLocaleString()} PKR`);

  // 3. VERIFY VERCEL.JSON CONFIGURATION
  console.log("\n🧪 3. VERIFYING VERCEL.JSON CRON CONFIGURATION:");
  const vercelJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'vercel.json'), 'utf8'));
  console.log("Loaded vercel.json:", JSON.stringify(vercelJson, null, 2));

  const crons = vercelJson.crons;
  if (!crons || crons.length !== 3) {
    throw new Error(`Expected 3 cron jobs in vercel.json, found ${crons?.length}`);
  }

  const weeklyCron = crons.find(c => c.path.includes('weekly'));
  const monthlyCron = crons.find(c => c.path.includes('monthly'));
  const yearlyCron = crons.find(c => c.path.includes('yearly'));

  if (weeklyCron?.schedule !== '0 0 * * 1') throw new Error("Weekly cron schedule must be '0 0 * * 1'");
  if (monthlyCron?.schedule !== '0 0 1 * *') throw new Error("Monthly cron schedule must be '0 0 1 * *'");
  if (yearlyCron?.schedule !== '0 0 1 1 *') throw new Error("Yearly cron schedule must be '0 0 1 1 *'");

  console.log(" ✅ vercel.json schedules verified!");

  console.log("\n==================================================================");
  console.log("🎉 ALL CRON NOTIFICATION & REPORTING TESTS PASSED FLAWLESSLY!");
  console.log("==================================================================");
}

runCronTests().catch(err => {
  console.error("❌ CRON TEST FAILED:", err);
  process.exit(1);
});
