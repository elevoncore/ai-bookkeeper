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
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  const userId = authData?.user?.id;
  console.log("Current test user id:", userId);

  // Fetch all accounts for all users
  const { data: accounts, error: accErr } = await supabase.from('accounts').select('*');
  console.log(`Total accounts in DB (all users): ${accounts?.length}`);
  
  if (accounts) {
    const askari = accounts.filter(a => a.name.toLowerCase().includes('askari'));
    console.log("Accounts matching 'Askari':", askari);

    const liabilities = accounts.filter(a => a.type === 'liability');
    console.log("All Liability accounts in DB:");
    liabilities.forEach(l => {
      console.log(` - ID: ${l.id} | User: ${l.user_id} | Name: "${l.name}" | is_cash: ${l.is_cash_account} | parent_account_id: ${l.parent_account_id} | parent_id: ${l.parent_id}`);
    });
  }
}

run().catch(console.error);
