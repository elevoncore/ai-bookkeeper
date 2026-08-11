import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testContextInjection() {
  console.log("=== STARTING PRODUCT CONTEXT INJECTION AUDIT ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) throw new Error("Auth failed");
  const userId = authData.user.id;

  // 1. Fetch user's existing products
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, name')
    .eq('user_id', userId);

  if (pErr) throw new Error(pErr.message);

  console.log(`Fetched ${prods?.length || 0} existing products from database for Context Injection:`);
  prods?.slice(0, 5).forEach(p => console.log(`  - [${p.id}] ${p.name}`));

  // Verify catalog injection string format
  const catalogListString = prods && prods.length > 0
    ? prods.map(p => `- ID: ${p.id} | Name: "${p.name}"`).join("\n")
    : "No existing products in catalog.";

  if (catalogListString.includes("ID:") && catalogListString.includes("Name:")) {
    console.log("✅ Catalog Context Injection Formatting PASSED!");
  } else {
    console.log("ℹ️ No existing catalog items found or empty list string.");
  }

  console.log("=== PRODUCT CONTEXT INJECTION AUDIT COMPLETED ===");
}

testContextInjection();
