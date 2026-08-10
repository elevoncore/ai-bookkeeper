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
  
  const { data: invoices } = await supabase.from('invoices').select('id, total_amount, is_ai_verified').eq('user_id', userId);
  console.log('Invoices:', invoices);
  
  const { data: bills } = await supabase.from('bills').select('id, total_amount, is_ai_verified').eq('user_id', userId);
  console.log('Bills:', bills);
  
  const { data: entries } = await supabase.from('journal_entries').select('id, reference_type').eq('user_id', userId);
  console.log('Journal Entries:', entries);
}
run();
