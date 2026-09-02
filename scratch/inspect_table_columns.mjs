import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function inspectSchema() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  const { data: accSample } = await supabase.from('accounts').select('*').limit(1);
  console.log("Accounts table columns:", Object.keys(accSample?.[0] || {}));

  const { data: invLineSample } = await supabase.from('invoice_lines').select('*').limit(1);
  console.log("Invoice_lines table columns:", Object.keys(invLineSample?.[0] || {}));

  const { data: billLineSample } = await supabase.from('bill_lines').select('*').limit(1);
  console.log("Bill_lines table columns:", Object.keys(billLineSample?.[0] || {}));

  const { data: jLineSample } = await supabase.from('journal_lines').select('*').limit(1);
  console.log("Journal_lines table columns:", Object.keys(jLineSample?.[0] || {}));

  const { data: jEntrySample } = await supabase.from('journal_entries').select('*').limit(1);
  console.log("Journal_entries table columns:", Object.keys(jEntrySample?.[0] || {}));
}

inspectSchema().catch(console.error);
