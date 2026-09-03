import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function runExecSql() {
  console.log("=== APPLYING PHASE 38 MIGRATION VIA exec_sql RPC ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const sqlContent = fs.readFileSync(path.join(projectPath, 'phase38_ai_action_items.sql'), 'utf8');

  const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
  if (error) {
    console.log("RPC exec_sql error:", error.message);
  } else {
    console.log("✅ Phase 38 SQL Migration Applied Successfully via exec_sql RPC!");
  }

  // Verify table
  const { data: testData, error: testErr } = await supabase.from('ai_action_items').select('*').limit(1);
  if (testErr) {
    console.log("Table check error:", testErr.message);
  } else {
    console.log("🎉 Table public.ai_action_items is active and queryable!");
  }
}

runExecSql().catch(console.error);
