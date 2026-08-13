import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function runExpenseTest() {
  console.log("=== STARTING GRANULAR EXPENSE CATEGORIZATION QA TEST ===");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Sign in as test user
  let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr || !authData.user) {
    const res = await supabase.auth.signInWithPassword({
      email: 'test@gmail.com',
      password: 'password123'
    });
    authData = res.data;
    authErr = res.error;
  }

  if (authErr || !authData.user) {
    console.error("Test login failed:", authErr?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Authenticated User ID: ${userId}`);

  // Ensure accounts initialized
  await supabase.rpc('initialize_default_accounts', { p_user_id: userId });

  // Get Chart of Accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  const softwareAcc = accounts.find(a => a.name.toLowerCase() === 'software & hosting');
  const utilitiesAcc = accounts.find(a => a.name.toLowerCase() === 'utilities');

  console.log("Software & Hosting Account ID:", softwareAcc?.id);
  console.log("Utilities Account ID:", utilitiesAcc?.id);

  if (!softwareAcc || !utilitiesAcc) {
    console.error("Missing standard expense accounts in database!");
    process.exit(1);
  }

  // TEST 1: Software & Hosting (AWS bill)
  console.log("\n--- TEST 1: Software & Hosting Categorization ---");
  const prompt1 = "I paid my AWS hosting bill for 15,000 PKR.";
  console.log(`Sending Prompt 1: "${prompt1}"`);

  const extractRes1 = await fetch("http://localhost:3001/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authData.session.access_token}`
    },
    body: JSON.stringify({
      prompt: prompt1,
      chartOfAccounts: accounts
    })
  });

  const json1 = await extractRes1.json();
  console.log("AI Extracted Intent:", json1.intent);
  console.log("AI Extracted Line Items:", JSON.stringify(json1.line_items, null, 2));

  const extractedAccName1 = json1.line_items?.[0]?.account_name;
  console.log(`Extracted Account Name: "${extractedAccName1}"`);

  // Resolve account ID
  const targetAccId1 = accounts.find(a => a.name.toLowerCase() === (extractedAccName1 || '').toLowerCase())?.id || softwareAcc.id;

  // Create atomic bill for Test 1
  const { data: billId1, error: billErr1 } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: userId,
    p_supplier_id: null,
    p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null,
    p_status: 'open',
    p_total_amount: 15000,
    p_receipt_url: null,
    p_line_items: [{
      account_id: targetAccId1,
      description: 'AWS hosting bill',
      amount: 15000
    }],
    p_currency_code: 'PKR',
    p_exchange_rate: 1.0,
    p_original_amount: 15000,
    p_created_by_source: 'AI'
  });

  if (billErr1) {
    console.error("Failed to create bill 1:", billErr1.message);
  } else {
    // Verify bill to trigger journal entries
    await supabase.from('bills').update({ is_ai_verified: true }).eq('id', billId1);
  }

  // Verify journal lines in database for Test 1
  const { data: lines1 } = await supabase
    .from('journal_lines')
    .select('id, account_id, debit, credit')
    .eq('account_id', softwareAcc.id);

  const test1DebitSum = (lines1 || []).reduce((sum, l) => sum + Number(l.debit || 0), 0);
  console.log(`Software & Hosting Account Total Debits: ${test1DebitSum} PKR`);

  const test1Passed = test1DebitSum >= 15000 && extractedAccName1?.toLowerCase().includes('software');
  console.log(`TEST 1 RESULT: ${test1Passed ? '✅ PASSED' : '❌ FAILED'}`);

  // TEST 2: Utilities (Electricity bill)
  console.log("\n--- TEST 2: Utilities Categorization ---");
  const prompt2 = "I paid the monthly electricity bill for 8,000 PKR.";
  console.log(`Sending Prompt 2: "${prompt2}"`);

  const extractRes2 = await fetch("http://localhost:3001/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authData.session.access_token}`
    },
    body: JSON.stringify({
      prompt: prompt2,
      chartOfAccounts: accounts
    })
  });

  const json2 = await extractRes2.json();
  console.log("AI Extracted Intent:", json2.intent);
  console.log("AI Extracted Line Items:", JSON.stringify(json2.line_items, null, 2));

  const extractedAccName2 = json2.line_items?.[0]?.account_name;
  console.log(`Extracted Account Name: "${extractedAccName2}"`);

  const targetAccId2 = accounts.find(a => a.name.toLowerCase() === (extractedAccName2 || '').toLowerCase())?.id || utilitiesAcc.id;

  const { data: billId2, error: billErr2 } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: userId,
    p_supplier_id: null,
    p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null,
    p_status: 'open',
    p_total_amount: 8000,
    p_receipt_url: null,
    p_line_items: [{
      account_id: targetAccId2,
      description: 'Monthly electricity bill',
      amount: 8000
    }],
    p_currency_code: 'PKR',
    p_exchange_rate: 1.0,
    p_original_amount: 8000,
    p_created_by_source: 'AI'
  });

  if (billErr2) {
    console.error("Failed to create bill 2:", billErr2.message);
  } else {
    // Verify bill to trigger journal entries
    await supabase.from('bills').update({ is_ai_verified: true }).eq('id', billId2);
  }

  // Verify journal lines in database for Test 2
  const { data: lines2 } = await supabase
    .from('journal_lines')
    .select('id, account_id, debit, credit')
    .eq('account_id', utilitiesAcc.id);

  const test2DebitSum = (lines2 || []).reduce((sum, l) => sum + Number(l.debit || 0), 0);
  console.log(`Utilities Account Total Debits: ${test2DebitSum} PKR`);

  const test2Passed = test2DebitSum >= 8000 && extractedAccName2?.toLowerCase().includes('utilities');
  console.log(`TEST 2 RESULT: ${test2Passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (test1Passed && test2Passed) {
    console.log("\n🎉 ALL EXPENSE CATEGORIZATION QA TESTS PASSED!");
  } else {
    console.error("\n❌ EXPENSE CATEGORIZATION QA TESTS FAILED.");
    process.exit(1);
  }
}

runExpenseTest();
