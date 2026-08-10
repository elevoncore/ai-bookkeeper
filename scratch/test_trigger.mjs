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
  
  const { data: invoices } = await supabase.from('invoices').select('id, is_ai_verified').limit(1);
  if(invoices && invoices.length > 0) {
      console.log('Attempting to update invoice', invoices[0].id);
      const { data, error } = await supabase.from('invoices').update({ is_ai_verified: false }).eq('id', invoices[0].id).select();
      const { data: d2, error: e2 } = await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invoices[0].id).select();
      console.log('Update Error:', e2);
  }
}
run();
