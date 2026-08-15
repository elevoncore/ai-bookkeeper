import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function seedLoanAccounts() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr || !authData.user) {
    console.error("Auth failed:", authErr?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log("Authenticated user:", userId);

  const loanAccounts = [
    { user_id: userId, name: 'Loan Payable', type: 'liability', is_system: true },
    { user_id: userId, name: 'Interest Expense', type: 'expense', is_system: true }
  ];

  for (const acc of loanAccounts) {
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('name', acc.name);

    if (!existing || existing.length === 0) {
      const { error: insErr } = await supabase.from('accounts').insert(acc);
      if (insErr) {
        console.error(`Error inserting ${acc.name}:`, insErr.message);
      } else {
        console.log(`✅ Seeded account: ${acc.name}`);
      }
    } else {
      console.log(`Account ${acc.name} already exists.`);
    }
  }
}

seedLoanAccounts();
