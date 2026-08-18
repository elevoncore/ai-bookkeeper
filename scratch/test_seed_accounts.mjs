import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSeed() {
  const { data: accounts, error: aErr } = await supabase
    .from('accounts')
    .select('user_id, name')
    .limit(10);
  
  if (aErr) {
    console.error("Error selecting accounts:", aErr);
    return;
  }

  const userId = accounts[0]?.user_id;
  console.log("Found sample user_id:", userId);

  if (!userId) return;

  const accountsToSeed = [
    { user_id: userId, name: 'Main Bank Account', code: '1010', type: 'asset', is_system: true, is_cash_account: true },
    { user_id: userId, name: 'Petty Cash', code: '1020', type: 'asset', is_system: true, is_cash_account: true },
    { user_id: userId, name: 'Accounts Receivable', code: '1200', type: 'asset', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Inventory Asset', code: '1300', type: 'asset', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Fixed Assets - Equipment/Furniture', code: '1510', type: 'asset', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Accounts Payable', code: '2010', type: 'liability', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Sales Tax Payable', code: '2020', type: 'liability', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Loan Payable', code: '2500', type: 'liability', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Owners Equity', code: '3010', type: 'equity', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Owner Drawings', code: '3020', type: 'equity', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Retained Earnings', code: '3030', type: 'equity', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Sales Revenue', code: '4010', type: 'revenue', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Service Revenue', code: '4020', type: 'revenue', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Cost of Goods Sold', code: '5010', type: 'expense', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Rent Expense', code: '5020', type: 'expense', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Utilities', code: '5030', type: 'expense', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Software & Hosting', code: '5040', type: 'expense', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'Interest Expense', code: '5050', type: 'expense', is_system: true, is_cash_account: false },
    { user_id: userId, name: 'General Operating Expense', code: '5900', type: 'expense', is_system: true, is_cash_account: false }
  ];

  for (const acc of accountsToSeed) {
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('name', acc.name)
      .limit(1);

    if (!existing || existing.length === 0) {
      const { data, error } = await supabase.from('accounts').insert(acc).select();
      if (error) {
        console.error("Failed inserting:", acc.name, error);
      } else {
        console.log("Successfully inserted:", acc.name, data[0]?.id);
      }
    } else {
      console.log("Already exists:", acc.name);
    }
  }
}

testSeed();
