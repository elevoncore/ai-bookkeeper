import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testTable() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth failed:", authErr);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Authenticated as user ${userId}`);

  // Test selecting from ai_action_items
  const { data, error } = await supabase.from('ai_action_items').select('*').eq('user_id', userId);
  if (error) {
    console.log("Table check error:", error.message, "| Code:", error.code);
  } else {
    console.log(`✅ Table ai_action_items exists! Current items count for user: ${data.length}`);
  }
}

testTable().catch(console.error);
