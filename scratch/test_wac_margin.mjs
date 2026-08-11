import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testWacAndMargin() {
  console.log("=== STARTING WAC & SERVICE MARGIN TESTS ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) throw new Error("Auth failed");
  const userId = authData.user.id;
  console.log("Authenticated User ID:", userId);

  // === SIMULATION 1: WAC MATH ===
  console.log("\n--- SIMULATION 1: Weighted Average Cost (WAC) ---");
  const rnd = Math.random().toString(36).substring(7);
  const { data: newProd, error: pErr1 } = await supabase.from('products').insert({
    user_id: userId,
    name: 'WAC Test Gadget ' + rnd,
    price: 30,
    cost: 0,
    inventory_count: 0,
    is_inventory_tracked: true
  }).select().single();
  if (pErr1) throw new Error("Prod 1 failed: " + pErr1.message);
  const wacProdId = newProd.id;
  
  // Purchase 10 at $10
  console.log("  Purchasing 10 units @ $10 each...");
  const { data: bill1, error: err1 } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: userId, p_supplier_id: null, p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null, p_status: 'open', p_total_amount: 100, p_receipt_url: null,
    p_line_items: [{ product_id: wacProdId, description: 'Batch 1', quantity: 10, amount: 100 }],
    p_currency_code: 'PKR', p_exchange_rate: 1.0, p_original_amount: 100
  });
  if (err1) throw new Error("Bill 1 failed: " + err1.message);
  await supabase.from('bills').update({ is_ai_verified: true }).eq('id', bill1);

  // Purchase 10 at $20
  console.log("  Purchasing 10 units @ $20 each...");
  const { data: bill2, error: err2 } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: userId, p_supplier_id: null, p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null, p_status: 'open', p_total_amount: 200, p_receipt_url: null,
    p_line_items: [{ product_id: wacProdId, description: 'Batch 2', quantity: 10, amount: 200 }],
    p_currency_code: 'PKR', p_exchange_rate: 1.0, p_original_amount: 200
  });
  if (err2) throw new Error("Bill 2 failed: " + err2.message);
  await supabase.from('bills').update({ is_ai_verified: true }).eq('id', bill2);

  // Verify WAC
  const { data: wacCheck } = await supabase.from('products').select('inventory_count, cost').eq('id', wacProdId).single();
  console.log(`  Current Stock: ${wacCheck.inventory_count} (Expected: 20)`);
  console.log(`  Current Unit Cost: $${wacCheck.cost} (Expected: $15)`);
  
  if (wacCheck.inventory_count !== 20) console.error("❌ Stock mismatch!");
  if (Number(wacCheck.cost) !== 15) console.error("❌ WAC mismatch!");
  else console.log("✅ WAC Test PASSED!");


  // === SIMULATION 2: SERVICE MARGIN & LEDGER ===
  console.log("\n--- SIMULATION 2: Untracked Service Margin ---");
  const { data: servProd, error: pErr2 } = await supabase.from('products').insert({
    user_id: userId,
    name: 'WAC Test Service ' + rnd,
    price: 150,
    cost: 50,
    inventory_count: 0,
    is_inventory_tracked: false
  }).select().single();
  if (pErr2) throw new Error("Prod 2 failed: " + pErr2.message);
  const servProdId = servProd.id;

  console.log("  Creating Service Invoice for $150 (Cost: $50)...");
  const { data: inv1, error: invErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
    p_user_id: userId, p_customer_id: null, p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null, p_status: 'open', p_total_amount: 150, p_receipt_url: null,
    p_line_items: [{ product_id: servProdId, description: 'Service Job', quantity: 1, unit_price: 150, total: 150 }],
    p_currency_code: 'PKR', p_exchange_rate: 1.0, p_original_amount: 150
  });
  if (invErr) throw new Error("Invoice failed: " + invErr.message);
  await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', inv1);

  // Verify Ledger
  const { data: jEntries } = await supabase.from('journal_entries').select('*, journal_lines(*, accounts(name))').eq('reference_id', inv1);
  const lines = jEntries[0]?.journal_lines || [];
  console.log(`  Total Journal Lines: ${lines.length} (Expected: 2)`);
  if (lines.length !== 2) console.error("❌ Service created COGS lines!");
  else console.log("✅ Service Ledger Test PASSED! (Only AR and Revenue)");

  console.log("\n⚠️ Next.js Estimated Margin UI test requires manual visual confirmation on the dashboard.");
}

testWacAndMargin();
