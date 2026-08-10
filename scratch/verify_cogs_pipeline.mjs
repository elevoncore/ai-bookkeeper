import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testPipeline() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth error:", authErr);
    return;
  }
  const userId = authData.user.id;
  console.log("Logged in user:", userId);

  // 1. Create or ensure test product "Test Banana"
  const { data: existingProd } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', 'Test Banana')
    .maybeSingle();

  let prodId = existingProd?.id;
  if (!prodId) {
    const { data: newProd, error: pErr } = await supabase
      .from('products')
      .insert({
        user_id: userId,
        name: 'Test Banana',
        price: 150,
        cost: 0,
        is_inventory_tracked: true,
        inventory_count: 0
      })
      .select()
      .single();
    if (pErr) console.error("Product create err:", pErr);
    prodId = newProd.id;
  }

  console.log("Product ID:", prodId);

  // 2. Call create_bill_with_lines_atomic: 50 units for 4,567 PKR
  const lineItemsBill = [
    {
      account_id: null,
      product_id: prodId,
      description: '50 kg banana',
      quantity: 50,
      unit_price: 91.34,
      amount: 4567
    }
  ];

  const { data: billId, error: bErr } = await supabase.rpc('create_bill_with_lines_atomic', {
    p_user_id: userId,
    p_supplier_id: null,
    p_issue_date: '2026-08-10',
    p_due_date: '2026-08-20',
    p_status: 'open',
    p_total_amount: 4567,
    p_receipt_url: null,
    p_line_items: lineItemsBill
  });

  if (bErr) console.error("Bill RPC error:", bErr);
  console.log("Created Bill ID:", billId);

  // Approve bill
  await supabase.from('bills').update({ is_ai_verified: true }).eq('id', billId);

  // Check updated product cost & inventory
  const { data: updatedProd } = await supabase.from('products').select('*').eq('id', prodId).single();
  console.log("Updated Product State after Purchase:", {
    cost: updatedProd.cost,
    inventory_count: updatedProd.inventory_count,
    expected_cost: 91.34
  });

  // 3. Call create_invoice_with_lines_atomic: 20 units for 3,564 PKR
  const lineItemsInv = [
    {
      product_id: prodId,
      description: '20 kg banana',
      quantity: 20,
      unit_price: 178.20,
      total: 3564
    }
  ];

  const { data: invId, error: iErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
    p_user_id: userId,
    p_customer_id: null,
    p_issue_date: '2026-08-10',
    p_due_date: '2026-08-20',
    p_status: 'open',
    p_total_amount: 3564,
    p_receipt_url: null,
    p_line_items: lineItemsInv
  });

  if (iErr) console.error("Invoice RPC error:", iErr);
  console.log("Created Invoice ID:", invId);

  // Approve invoice
  await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invId);

  // Check Journal Entries for COGS
  const { data: je } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*, accounts(name))')
    .eq('reference_id', invId);

  console.log("Invoice Journal Entries:", JSON.stringify(je, null, 2));
}

testPipeline();
