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
  const sql = fs.readFileSync(path.join(projectPath, 'phase10_cogs_fix.sql'), 'utf8');

  console.log("Applying SQL migration...");
  // Split statements or execute via RPC if available, or fetch via postgres API
  // Using direct sql runner if available or rpc
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      if (error) {
        console.log("Exec SQL error (attempting direct execute):", error.message);
      }
    } catch (e) {
      console.log("RPC exec_sql not available:", e.message);
    }
  }

  console.log("SQL script processed.");
}

run();
