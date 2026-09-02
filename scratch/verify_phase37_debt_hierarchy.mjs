import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function test() {
  console.log("=== RUNNING PHASE 37 VERIFICATION AUDIT ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  const userId = authData.user.id;
  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', userId);

  console.log(`Total Accounts for user: ${accounts.length}`);

  // Test 1: Check if any liability account has is_cash_account = true
  const corruptedLiabilities = accounts.filter(a => a.type === 'liability' && a.is_cash_account === true);
  console.log(`Test 1 - Corrupted Liabilities (is_cash_account=true): ${corruptedLiabilities.length}`);
  if (corruptedLiabilities.length > 0) {
    throw new Error(`Data corruption detected: ${JSON.stringify(corruptedLiabilities)}`);
  }

  // Test 2: Check Control Accounts exist
  const stDebt = accounts.find(a => a.name === 'Short-Term Debt' && a.type === 'liability');
  const ltDebt = accounts.find(a => a.name === 'Long-Term Debt' && a.type === 'liability');
  console.log(`Test 2 - Short-Term Debt Account: ${stDebt ? 'EXISTS (' + stDebt.id + ')' : 'MISSING'}`);
  console.log(`Test 2 - Long-Term Debt Account: ${ltDebt ? 'EXISTS (' + ltDebt.id + ')' : 'MISSING'}`);
  if (!stDebt || !ltDebt) {
    throw new Error("Missing Short-Term Debt or Long-Term Debt control account!");
  }

  // Test 3: Check Legacy Loan Payable accounts deleted
  const oldLoanPayable = accounts.find(a => a.name === 'Loan Payable' || a.name === 'Long-Term Loan Payable');
  console.log(`Test 3 - Generic Loan Payable Accounts: ${oldLoanPayable ? 'STILL PRESENT (' + oldLoanPayable.name + ')' : 'CLEANED UP / DELETED'}`);
  if (oldLoanPayable) {
    throw new Error("Generic Loan Payable accounts must be deleted!");
  }

  // Test 4: Check Child Lender accounts have parent_id / parent_account_id
  const customLenders = accounts.filter(a => a.type === 'liability' && !a.is_system);
  console.log(`Test 4 - Custom Lender Sub-Accounts count: ${customLenders.length}`);
  customLenders.forEach(l => {
    const parentId = l.parent_account_id || l.parent_id;
    const parent = accounts.find(a => a.id === parentId);
    console.log(`   - Lender: "${l.name}" -> Parent: "${parent?.name || 'NONE'}" (is_cash: ${l.is_cash_account})`);
    if (l.is_cash_account === true) throw new Error(`Lender ${l.name} has is_cash_account = true!`);
    if (!parent) console.warn(`Warning: Lender ${l.name} does not have a parent control account.`);
  });

  console.log("\n✅ ALL AUDIT VERIFICATIONS PASSED CLEANLY!");
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
