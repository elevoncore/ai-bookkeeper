import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

const sqlContent = fs.readFileSync(path.join(projectPath, 'scratch', 'phase18_journal_entry_rpc.sql'), 'utf8');

async function deployRPC() {
  console.log("=== DEPLOYING RPC create_journal_entry_atomic ===");
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Sign in as test user
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr || !authData.user) {
    console.error("Auth failed:", authErr?.message);
    process.exit(1);
  }

  console.log("Authenticated as:", authData.user.email);

  // Try calling RPC directly to test if it already exists or can be invoked
  const { data: testCall, error: testErr } = await supabase.rpc('create_journal_entry_atomic', {
    p_user_id: authData.user.id,
    p_date: new Date().toISOString().split('T')[0],
    p_description: 'RPC Test Check',
    p_lines: [],
    p_created_by_source: 'MANUAL'
  });

  if (testErr) {
    console.log("Existing RPC Test Response:", testErr.message);
  } else {
    console.log("RPC exists! Response:", testCall);
  }
}

deployRPC();
