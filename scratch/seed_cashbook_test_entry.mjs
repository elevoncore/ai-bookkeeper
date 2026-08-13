import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function seedCashbookTest() {
  console.log("=== SEEDING CASHBOOK MOCK JOURNAL ENTRY (50,000 PKR) ===");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Login
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
    console.error("Auth failed:", authErr?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`User ID: ${userId}`);

  // Ensure accounts initialized
  await supabase.rpc('initialize_default_accounts', { p_user_id: userId });

  // Get Main Bank Account ID & Owners Equity ID
  const { data: mainBankAcc } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Main Bank Account')
    .single();

  const { data: equityAcc } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('name', 'Owners Equity')
    .single();

  if (!mainBankAcc || !equityAcc) {
    console.error("Could not find required accounts for seeding journal entry.");
    process.exit(1);
  }

  console.log("Main Bank Account ID:", mainBankAcc.id);
  console.log("Owners Equity Account ID:", equityAcc.id);

  // Check if initial investment journal entry already exists
  const { data: existingJE } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('description', 'Initial Capital Investment - Mock Seed')
    .limit(1);

  if (!existingJE || existingJE.length === 0) {
    // Insert Journal Entry
    const { data: newJE, error: jeErr } = await supabase
      .from('journal_entries')
      .insert({
        user_id: userId,
        date: new Date().toISOString().split('T')[0],
        description: 'Initial Capital Investment - Mock Seed',
        reference_type: 'opening_balance'
      })
      .select('id')
      .single();

    if (jeErr || !newJE) {
      console.error("Failed to insert journal entry:", jeErr?.message);
      process.exit(1);
    }

    const jeId = newJE.id;

    // Insert Journal Lines: Debit Main Bank Account 50,000 PKR, Credit Owners Equity 50,000 PKR
    const { error: linesErr } = await supabase
      .from('journal_lines')
      .insert([
        {
          journal_entry_id: jeId,
          account_id: mainBankAcc.id,
          debit: 50000,
          credit: 0
        },
        {
          journal_entry_id: jeId,
          account_id: equityAcc.id,
          debit: 0,
          credit: 50000
        }
      ]);

    if (linesErr) {
      console.error("Failed to insert journal lines:", linesErr.message);
      process.exit(1);
    }

    console.log("✓ Successfully seeded Journal Entry: Debit Main Bank Account 50,000 PKR / Credit Owners Equity 50,000 PKR.");
  } else {
    console.log("✓ Mock Journal Entry already present in database.");
  }

  // Query Cashbook API / math verification directly
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('debit, credit')
    .eq('account_id', mainBankAcc.id);

  let totalDebit = 0;
  let totalCredit = 0;
  (lines || []).forEach(l => {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  });

  const mainBankBalance = totalDebit - totalCredit;
  console.log(`\n--- CASHBOOK MATH VERIFICATION ---`);
  console.log(`Main Bank Account Total Debits: ${totalDebit} PKR`);
  console.log(`Main Bank Account Total Credits: ${totalCredit} PKR`);
  console.log(`Main Bank Account Net Balance: ${mainBankBalance} PKR`);

  if (mainBankBalance >= 50000) {
    console.log("✅ CASHBOOK BACKEND SEEDING MATH VERIFIED PASSED!");
  } else {
    console.error("❌ CASHBOOK BACKEND SEEDING MATH FAILED.");
    process.exit(1);
  }
}

seedCashbookTest();
