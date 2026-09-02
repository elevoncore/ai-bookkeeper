import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function auditExports() {
  console.log("=== RUNNING EXPORT ENGINE AUDIT ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log("Authenticated successfully as testuser@aibookkeeper.com");

  // Test calling /api/export
  const res = await fetch('http://localhost:3000/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      timeframe: 'all',
      selectedModules: ['Overview', 'Sales', 'Purchases', 'Accounting']
    })
  });

  console.log(`Response status: ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error("Export failed:", text);
  } else {
    const buffer = await res.arrayBuffer();
    console.log(`Generated Excel buffer size: ${buffer.byteLength} bytes`);
  }
}

auditExports().catch(console.error);
