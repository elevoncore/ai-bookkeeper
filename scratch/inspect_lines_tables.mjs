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
  
  // Inspect a line item table structure
  const { data: lineSample, error } = await supabase.from('invoice_lines').select('*').limit(1);
  console.log("invoice_lines sample:", lineSample, error);

  const { data: billSample, error2 } = await supabase.from('bill_lines').select('*').limit(1);
  console.log("bill_lines sample:", billSample, error2);

  // Inspect products table
  const { data: prodSample, error3 } = await supabase.from('products').select('*').limit(1);
  console.log("products sample:", prodSample, error3);
}
run();
