import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function applySql() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const sqlContent = fs.readFileSync(path.join(projectPath, 'phase10_cogs_fix.sql'), 'utf8');

  console.log("Applying SQL functions via REST/Postgres...");
  // Attempt running via exec_sql or direct rest
  const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
  if (error) {
    console.log("RPC exec_sql result:", error.message);
  } else {
    console.log("SQL Migration Applied Successfully via RPC!");
  }
}

applySql();
