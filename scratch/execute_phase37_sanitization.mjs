import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function run() {
  console.log("=== EXECUTING PHASE 37 DATABASE SANITIZATION & DEBT HIERARCHY ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Authenticated as user: ${userId}`);

  // 1. Fetch all accounts for user
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  if (accErr) {
    console.error("Failed to fetch accounts:", accErr);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} existing accounts.`);

  // 2. Fix Critical Data Corruption: Ensure is_cash_account = false for all liabilities
  console.log("Step 1: Sanitizing is_cash_account on all liability accounts...");
  const corruptedLiabilities = accounts.filter(a => a.type === 'liability' && a.is_cash_account === true);
  console.log(`Found ${corruptedLiabilities.length} corrupted liability accounts with is_cash_account = true:`, corruptedLiabilities.map(a => a.name));

  for (const acc of accounts) {
    if (acc.type === 'liability' && acc.is_cash_account !== false) {
      const { error } = await supabase
        .from('accounts')
        .update({ is_cash_account: false })
        .eq('id', acc.id);
      if (error) {
        console.warn(`Failed to update is_cash_account for ${acc.name}:`, error.message);
      } else {
        console.log(`✓ Set is_cash_account = false on liability account "${acc.name}"`);
        acc.is_cash_account = false;
      }
    }
  }

  // 3. Ensure Short-Term Debt & Long-Term Debt control accounts exist
  console.log("\nStep 2: Ensuring Control Accounts (Short-Term Debt & Long-Term Debt)...");
  
  let stDebtAcc = accounts.find(a => a.name === 'Short-Term Debt' && a.type === 'liability');
  if (!stDebtAcc) {
    const { data: newSt, error: stErr } = await supabase.from('accounts').insert({
      user_id: userId,
      name: 'Short-Term Debt',
      type: 'liability',
      is_system: true,
      is_cash_account: false
    }).select().single();
    if (stErr) {
      console.error("Failed to create Short-Term Debt:", stErr.message);
    } else {
      console.log("✓ Created Control Account: Short-Term Debt");
      stDebtAcc = newSt;
      accounts.push(newSt);
    }
  } else {
    console.log("✓ Short-Term Debt control account exists.");
  }

  let ltDebtAcc = accounts.find(a => a.name === 'Long-Term Debt' && a.type === 'liability');
  if (!ltDebtAcc) {
    const { data: newLt, error: ltErr } = await supabase.from('accounts').insert({
      user_id: userId,
      name: 'Long-Term Debt',
      type: 'liability',
      is_system: true,
      is_cash_account: false
    }).select().single();
    if (ltErr) {
      console.error("Failed to create Long-Term Debt:", ltErr.message);
    } else {
      console.log("✓ Created Control Account: Long-Term Debt");
      ltDebtAcc = newLt;
      accounts.push(newLt);
    }
  } else {
    console.log("✓ Long-Term Debt control account exists.");
  }

  // 4. Update specific lender accounts (e.g., Askari Bank) by setting parent_account_id to Long-Term Debt
  console.log("\nStep 3: Nesting specific lender accounts under Control Categories...");
  const customLenders = accounts.filter(a => a.type === 'liability' && !a.is_system);
  for (const lender of customLenders) {
    const isShort = lender.name.toLowerCase().includes('short-term') || lender.name.toLowerCase().includes('< 12');
    const targetParent = isShort ? stDebtAcc : ltDebtAcc;

    if (targetParent) {
      let updatePayload = {
        is_cash_account: false,
        parent_account_id: targetParent.id,
        parent_id: targetParent.id
      };

      const { error: updErr } = await supabase
        .from('accounts')
        .update(updatePayload)
        .eq('id', lender.id);

      if (updErr && updErr.message.includes('parent_account_id')) {
        delete updatePayload.parent_account_id;
        await supabase.from('accounts').update(updatePayload).eq('id', lender.id);
      }

      console.log(`✓ Nested lender "${lender.name}" under "${targetParent.name}" (is_cash_account: false)`);
    }
  }

  // 5. Clean up old generic "Loan Payable" and "Long-Term Loan Payable" accounts
  console.log("\nStep 4: Cleaning up legacy generic Loan Payable accounts...");
  const oldLoanPayable = accounts.find(a => a.name === 'Loan Payable' && a.type === 'liability');
  if (oldLoanPayable && stDebtAcc) {
    console.log(`Migrating journal lines from Loan Payable (${oldLoanPayable.id}) to Short-Term Debt (${stDebtAcc.id})...`);
    await supabase.from('journal_lines').update({ account_id: stDebtAcc.id }).eq('account_id', oldLoanPayable.id);
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', oldLoanPayable.id);
    if (delErr) {
      console.warn("Could not delete Loan Payable:", delErr.message);
    } else {
      console.log("✓ Deleted legacy Loan Payable account.");
    }
  }

  const oldLtLoanPayable = accounts.find(a => a.name === 'Long-Term Loan Payable' && a.type === 'liability');
  if (oldLtLoanPayable && ltDebtAcc) {
    console.log(`Migrating journal lines from Long-Term Loan Payable (${oldLtLoanPayable.id}) to Long-Term Debt (${ltDebtAcc.id})...`);
    await supabase.from('journal_lines').update({ account_id: ltDebtAcc.id }).eq('account_id', oldLtLoanPayable.id);
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', oldLtLoanPayable.id);
    if (delErr) {
      console.warn("Could not delete Long-Term Loan Payable:", delErr.message);
    } else {
      console.log("✓ Deleted legacy Long-Term Loan Payable account.");
    }
  }

  // 6. Verification
  console.log("\n=== POST-MIGRATION VERIFICATION ===");
  const { data: finalAccounts } = await supabase.from('accounts').select('*').eq('user_id', userId);
  const finalLiabilities = (finalAccounts || []).filter(a => a.type === 'liability');
  console.log("Liabilities in database:");
  finalLiabilities.forEach(l => {
    console.log(` - [${l.is_system ? 'SYSTEM' : 'CUSTOM'}] ${l.name} | is_cash: ${l.is_cash_account} | parent_id: ${l.parent_account_id || l.parent_id || 'none'}`);
  });

  const remainingCorrupted = finalLiabilities.filter(l => l.is_cash_account === true);
  if (remainingCorrupted.length === 0) {
    console.log("✅ DATA SANITIZATION SUCCESSFUL: 0 corrupted liabilities found!");
  } else {
    console.error("❌ Warning: Corrupted liabilities still found:", remainingCorrupted);
  }
}

run().catch(console.error);
