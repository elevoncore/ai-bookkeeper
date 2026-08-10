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
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!',
  });
  if (error || !authData.user) {
      console.log('Login failed', error);
      return;
  }
  const userId = authData.user.id;
  console.log('Testing aggregation for user:', userId);
  
  const { data: accounts } = await supabase.from('accounts').select('id, name, type').eq('user_id', userId);
  const { data: journalLines } = await supabase.from('journal_lines').select('account_id, debit, credit, journal_entries!inner(user_id)').eq('journal_entries.user_id', userId);
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  const balances = new Map();
  for (const acc of accounts) balances.set(acc.id, { d: 0, c: 0 });
  
  for (const l of (journalLines || [])) {
      const d = Math.round(Number(l.debit || 0) * 100);
      const c = Math.round(Number(l.credit || 0) * 100);
      const cur = balances.get(l.account_id) || { d: 0, c: 0 };
      cur.d += d;
      cur.c += c;
      balances.set(l.account_id, cur);
  }
  
  for (const acc of accounts) {
      const { d, c } = balances.get(acc.id);
      totalDebits += d;
      totalCredits += c;
  }
  
  console.log('Total Debits:', totalDebits / 100);
  console.log('Total Credits:', totalCredits / 100);
  console.log('Difference:', Math.abs(totalDebits - totalCredits) / 100);
  
  if (totalDebits === totalCredits) {
      console.log('TRIAL BALANCE PASSED: DEBITS == CREDITS');
  } else {
      console.log('TRIAL BALANCE FAILED');
  }
}

run();
