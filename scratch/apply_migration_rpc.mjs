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

  console.log("1. Adding code column if not exists...");
  const { error: err1 } = await supabase.rpc('exec_sql', { sql: 'ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS code TEXT;' });
  if (err1) {
    console.error("Error adding code column:", err1.message);
  } else {
    console.log("Column 'code' ensured successfully!");
  }

  console.log("2. Running phase31_advances_and_loans.sql...");
  const sqlContent = fs.readFileSync(path.join(projectPath, 'phase31_advances_and_loans.sql'), 'utf8');
  const { error: err2 } = await supabase.rpc('exec_sql', { sql: sqlContent });
  if (err2) {
    console.error("Error running SQL script:", err2.message);
  } else {
    console.log("SQL Migration Applied Successfully via RPC!");
  }
}

run();
