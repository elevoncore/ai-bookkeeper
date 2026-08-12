import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function checkCols() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('invoices').select('id, created_by_source, is_manually_edited').limit(1);
  console.log("Invoices col check data:", data, "error:", error);
}

checkCols();
