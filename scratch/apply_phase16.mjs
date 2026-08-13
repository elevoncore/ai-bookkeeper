import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function runPhase16() {
  console.log("=== APPLYING PHASE 16 FIX RPC OVERLOADS ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const sqlContent = fs.readFileSync(path.join(projectPath, 'phase16_fix_rpc_overloads.sql'), 'utf8');

  const { data, error } = await supabase.rpc('exec_sql', { sql: sqlContent });
  if (error) {
    console.log("RPC exec_sql notice/error:", error.message);
  } else {
    console.log("Phase 16 SQL Migration Applied Successfully via RPC!");
  }
}

runPhase16();
