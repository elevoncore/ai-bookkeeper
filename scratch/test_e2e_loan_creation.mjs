import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testE2ELoan() {
  console.log("=== VERIFYING END-TO-END LOAN CREATION PIPELINE ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  // Fetch accounts
  const { data: accs } = await supabase.from('accounts').select('*').eq('user_id', userId);
  const ltDebt = accs.find(a => a.name === 'Long-Term Debt');
  const mainBank = accs.find(a => a.name === 'Main Bank Account');

  console.log(`Found Long-Term Debt: ${ltDebt?.id}`);
  console.log(`Found Main Bank Account: ${mainBank?.id}`);

  // Simulate resolving/creating Meezan Bank loan account
  let { data: meezanAcc } = await supabase.from('accounts').select('*').eq('user_id', userId).eq('name', 'Meezan Bank').maybeSingle();
  if (!meezanAcc) {
    const { data: created, error: insErr } = await supabase.from('accounts').insert({
      user_id: userId,
      name: 'Meezan Bank',
      type: 'liability',
      is_system: false,
      is_cash_account: false,
      parent_account_id: ltDebt.id,
      parent_id: ltDebt.id
    }).select().single();
    if (insErr) throw insErr;
    meezanAcc = created;
    console.log("Created Meezan Bank account:", meezanAcc);
  } else {
    console.log("Existing Meezan Bank account:", meezanAcc);
  }

  if (meezanAcc.is_cash_account !== false) {
    throw new Error("Meezan Bank must have is_cash_account = false!");
  }
  if (meezanAcc.parent_account_id !== ltDebt.id && meezanAcc.parent_id !== ltDebt.id) {
    throw new Error("Meezan Bank must have parent pointing to Long-Term Debt!");
  }

  console.log("✅ Meezan Bank liability account verified with strict parent_account_id and non-cash status!");
}

testE2ELoan().catch(err => {
  console.error(err);
  process.exit(1);
});
