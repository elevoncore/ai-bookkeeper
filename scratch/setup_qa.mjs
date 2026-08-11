import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function setupQA() {
  console.log("=== PRE-TEST SETUP ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });
  const userId = authData.user.id;

  // 1. Delete duplicate mango / apple test items so we start clean
  await supabase.from('products').delete().eq('user_id', userId).ilike('name', '%mango%');
  await supabase.from('products').delete().eq('user_id', userId).ilike('name', '%apple%');
  await supabase.from('products').delete().eq('user_id', userId).ilike('name', '%laptop%');

  // 2. Ensure "Laptop" exists for Test 4 Ambiguity test
  let { data: laptop } = await supabase.from('products').select('*').eq('user_id', userId).ilike('name', 'Laptop').maybeSingle();
  if (!laptop) {
    const { data: newLap } = await supabase.from('products').insert({
      user_id: userId,
      name: 'Laptop',
      price: 120000,
      cost: 90000,
      inventory_count: 5,
      is_inventory_tracked: true
    }).select().single();
    laptop = newLap;
  }

  console.log("Seeded product for Test 4:", laptop?.name);
  console.log("Pre-test setup completed cleanly.");
}

setupQA();
