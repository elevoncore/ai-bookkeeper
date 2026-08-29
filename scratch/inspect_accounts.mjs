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
  
  const { data: accounts, error } = await supabase.from('accounts').select('*').eq('user_id', userId);
  if (error) {
    console.error(error);
  } else {
    console.log("Accounts:");
    accounts.forEach(a => {
      console.log(`- ID: ${a.id} | Name: ${a.name} | Type: ${a.type} | Is Cash: ${a.is_cash_account} | Balance: ${a.balance}`);
    });
  }
}
run();
