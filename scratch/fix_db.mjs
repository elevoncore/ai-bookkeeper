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
  const { data: authData } = await supabase.auth.signInWithPassword({email: 'testuser@aibookkeeper.com', password: 'Password123!'});
  const userId = authData.user.id;
  
  const systemAccounts = [
      { user_id: userId, name: 'Cash', type: 'asset', is_system: true },
      { user_id: userId, name: 'Accounts Receivable', type: 'asset', is_system: true },
      { user_id: userId, name: 'Accounts Payable', type: 'liability', is_system: true },
      { user_id: userId, name: 'Sales Revenue', type: 'revenue', is_system: true },
      { user_id: userId, name: 'Cost of Goods Sold', type: 'expense', is_system: true },
      { user_id: userId, name: 'Inventory Asset', type: 'asset', is_system: true }
  ];
  
  // Upsert the system accounts
  for(const acc of systemAccounts) {
      await supabase.from('accounts').upsert(acc, { onConflict: 'user_id,name' });
  }
  
  console.log('Restored system accounts.');
  
  // Now reset is_ai_verified for all invoices and bills so we can re-trigger
  await supabase.from('invoices').update({ is_ai_verified: false }).eq('user_id', userId);
  await supabase.from('bills').update({ is_ai_verified: false }).eq('user_id', userId);
  
  // Re-verify them!
  const { data: i } = await supabase.from('invoices').update({ is_ai_verified: true }).eq('user_id', userId).select('id');
  const { data: b } = await supabase.from('bills').update({ is_ai_verified: true }).eq('user_id', userId).select('id');
  
  console.log('Re-verified invoices:', i?.length);
  console.log('Re-verified bills:', b?.length);
  
  const { data: entries } = await supabase.from('journal_entries').select('id');
  console.log('Total Journal Entries now:', entries?.length);
}
run();
