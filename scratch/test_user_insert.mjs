import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testUserInsert() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Sign in failed:", authErr);
    return;
  }

  const user = authData.user;
  console.log("Signed in as:", user.email, user.id);

  const testAccounts = [
    { user_id: user.id, name: 'Fixed Assets - Equipment/Furniture', type: 'asset', is_system: true, is_cash_account: false },
    { user_id: user.id, name: 'Sales Tax Payable', type: 'liability', is_system: true, is_cash_account: false },
    { user_id: user.id, name: 'Owner Drawings', type: 'equity', is_system: true, is_cash_account: false },
    { user_id: user.id, name: 'Retained Earnings', type: 'equity', is_system: true, is_cash_account: false }
  ];

  for (const acc of testAccounts) {
    const { data: existing } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('name', acc.name);

    if (!existing || existing.length === 0) {
      const { data, error } = await supabase.from('accounts').insert(acc).select();
      if (error) {
        console.error("Insert error for", acc.name, ":", error);
      } else {
        console.log("Successfully inserted:", acc.name, data[0]?.id);
      }
    } else {
      console.log("Already exists:", acc.name);
    }
  }
}

testUserInsert();
