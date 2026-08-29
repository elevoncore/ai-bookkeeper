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

  // Authenticate
  await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  console.log("Fetching RPC list...");
  const { data, error } = await supabase.from('pg_proc').select('proname');
  if (error) {
    console.error("Error querying pg_proc:", error.message);
  } else {
    console.log("Routines in pg_proc:", data.map(d => d.proname));
  }
}

run();
