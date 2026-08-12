import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testRPC() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  console.log("Logged in user:", authData.user?.id);

  // Try creating a test bill with create_bill_with_lines_atomic
  const { data: billId, error: billErr } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: authData.user.id,
    p_supplier_id: null,
    p_issue_date: '2026-08-12',
    p_due_date: null,
    p_status: 'open',
    p_total_amount: 100,
    p_receipt_url: null,
    p_line_items: [{ account_id: null, description: 'Test', amount: 100 }],
    p_created_by_source: 'AI'
  });

  console.log("RPC call with p_created_by_source result:", billId, "error:", billErr);
}

testRPC();
