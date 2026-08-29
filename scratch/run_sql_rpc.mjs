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
  const sql = process.argv[2];
  if (!sql) {
    console.error("Please provide SQL string");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    console.error("Error invoking exec_sql RPC:", error.message);
    process.exit(1);
  } else {
    console.log("Success! Data:", data);
  }
}
run();
