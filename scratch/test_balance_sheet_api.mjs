import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testBalanceSheet() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr || !authData.user) {
    console.error("Auth failed:", authErr?.message);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log("Testing Balance Sheet API...");

  const res = await fetch('http://localhost:3001/api/reports/balance-sheet', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const json = await res.json();
  console.log("Balance Sheet API Output:\n", JSON.stringify(json, null, 2));
}

testBalanceSheet();
