import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function syncAll() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  const userId = authData.user.id;

  const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', userId);
  const ltDebt = accounts.find(a => a.name === 'Long-Term Debt');
  const stDebt = accounts.find(a => a.name === 'Short-Term Debt');

  for (const acc of accounts) {
    // 1. Force is_cash_account = false on all liabilities
    if (acc.type === 'liability' && acc.is_cash_account !== false) {
      await supabase.from('accounts').update({ is_cash_account: false }).eq('id', acc.id);
      console.log(`Set is_cash_account = false on "${acc.name}"`);
    }

    // 2. Set parent on custom liabilities
    if (acc.type === 'liability' && !acc.is_system) {
      const parent = (acc.parent_account_id || acc.parent_id) 
        ? accounts.find(p => p.id === (acc.parent_account_id || acc.parent_id))
        : ltDebt;

      if (parent) {
        await supabase.from('accounts').update({
          parent_account_id: parent.id,
          parent_id: parent.id,
          is_cash_account: false
        }).eq('id', acc.id);
        console.log(`Synced parent of "${acc.name}" to "${parent.name}"`);
      }
    }
  }

  const { data: final } = await supabase.from('accounts').select('*').eq('user_id', userId);
  console.log("FINAL LIABILITIES:");
  final.filter(a => a.type === 'liability').forEach(l => {
    console.log(` - "${l.name}" | is_cash: ${l.is_cash_account} | parent_account_id: ${l.parent_account_id} | parent_id: ${l.parent_id}`);
  });
}

syncAll().catch(console.error);
