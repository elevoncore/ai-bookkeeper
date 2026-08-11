import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testInventoryReconciliation() {
  console.log("=== STARTING INVENTORY RECONCILIATION AUDIT ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) throw new Error("Auth failed");
  const userId = authData.user.id;
  console.log("Authenticated User ID:", userId);

  // 1. Create a product with stock = 20 and cost = 15
  const rnd = Math.random().toString(36).substring(7);
  const { data: prod, error: pErr } = await supabase.from('products').insert({
    user_id: userId,
    name: 'Stocktake Coffee ' + rnd,
    price: 30,
    cost: 15,
    inventory_count: 20,
    is_inventory_tracked: true
  }).select().single();
  if (pErr) throw new Error(pErr.message);
  console.log(`Created Product: ${prod.name} | Initial Stock: ${prod.inventory_count} | Cost: $${prod.cost}`);

  // 2. Test Negative Variance (Shrinkage): Stock count = 15 (5 missing -> 5 * 15 = $75 expense)
  console.log("\n--- TEST 1: Stock Shrinkage (Counted 15 items, expected 20) ---");
  const { error: rpcErr1 } = await supabase.rpc('reconcile_inventory_atomic', {
    p_user_id: userId,
    p_product_id: prod.id,
    p_actual_stock_count: 15,
    p_reason: '5 spilled coffee bags'
  });

  if (rpcErr1) {
    console.error("RPC Error (Ensure phase12_inventory_reconciliation.sql is executed):", rpcErr1.message);
  } else {
    const { data: prodCheck1 } = await supabase.from('products').select('inventory_count').eq('id', prod.id).single();
    console.log(`  Updated Stock: ${prodCheck1.inventory_count} (Expected: 15)`);
    
    // Check Journal Lines
    const { data: jEntries1 } = await supabase.from('journal_entries').select('*, journal_lines(*, accounts(name))').eq('reference_id', prod.id);
    const lines1 = jEntries1[0]?.journal_lines || [];
    console.log("  Journal Entries Generated:", lines1.length);
    lines1.forEach(l => {
      console.log(`    Account [${l.accounts?.name}] | Debit: $${l.debit} | Credit: $${l.credit}`);
    });
    
    const expLine = lines1.find(l => l.accounts?.name === 'Inventory Shrinkage/Variance Expense');
    const assetLine = lines1.find(l => l.accounts?.name === 'Inventory Asset');
    if (expLine && Number(expLine.debit) === 75 && assetLine && Number(assetLine.credit) === 75) {
      console.log("✅ Shrinkage Test PASSED! ($75 Expense Debit, $75 Asset Credit)");
    } else {
      console.error("❌ Shrinkage Math Mismatch!");
    }
  }

  // 3. Test Positive Variance (Surplus): Stock count = 25 (10 surplus -> 10 * 15 = $150 surplus)
  console.log("\n--- TEST 2: Stock Surplus (Counted 25 items, expected 15) ---");
  const { error: rpcErr2 } = await supabase.rpc('reconcile_inventory_atomic', {
    p_user_id: userId,
    p_product_id: prod.id,
    p_actual_stock_count: 25,
    p_reason: 'Found extra uncounted crate'
  });

  if (rpcErr2) {
    console.error("RPC Error:", rpcErr2.message);
  } else {
    const { data: prodCheck2 } = await supabase.from('products').select('inventory_count').eq('id', prod.id).single();
    console.log(`  Updated Stock: ${prodCheck2.inventory_count} (Expected: 25)`);
    
    const { data: jEntries2 } = await supabase.from('journal_entries').select('*, journal_lines(*, accounts(name))').eq('reference_id', prod.id);
    const lines2 = jEntries2[1]?.journal_lines || [];
    console.log("  Journal Entries Generated:", lines2.length);
    lines2.forEach(l => {
      console.log(`    Account [${l.accounts?.name}] | Debit: $${l.debit} | Credit: $${l.credit}`);
    });

    const expLine2 = lines2.find(l => l.accounts?.name === 'Inventory Shrinkage/Variance Expense');
    const assetLine2 = lines2.find(l => l.accounts?.name === 'Inventory Asset');
    if (assetLine2 && Number(assetLine2.debit) === 150 && expLine2 && Number(expLine2.credit) === 150) {
      console.log("✅ Surplus Test PASSED! ($150 Asset Debit, $150 Expense Credit)");
    } else {
      console.error("❌ Surplus Math Mismatch!");
    }
  }

  console.log("\n=== INVENTORY RECONCILIATION AUDIT COMPLETED ===");
}

testInventoryReconciliation();
