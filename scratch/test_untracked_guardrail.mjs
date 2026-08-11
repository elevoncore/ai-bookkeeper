import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testUntrackedGuardrail() {
  console.log("=== STARTING UNTRACKED GUARDRAIL & CATALOG EDIT VERIFICATION ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Auth Error:", authErr);
    return;
  }
  const userId = authData.user.id;
  console.log("Authenticated User ID:", userId);

  // --- TEST 1: CATALOG EDIT (PRICE & UNTRACKED TOGGLE) ---
  console.log("\n--- TEST 1: Product Master Data Edit ---");
  const { data: existingProd } = await supabase
    .from('products')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', 'Web Design Service')
    .maybeSingle();

  let prodId = existingProd?.id;
  if (!prodId) {
    const { data: newProd } = await supabase
      .from('products')
      .insert({
        user_id: userId,
        name: 'Web Design Service',
        price: 5000,
        cost: 1500, // Standard Cost for managerial reporting
        is_inventory_tracked: false,
        inventory_count: 0
      })
      .select()
      .single();
    prodId = newProd.id;
  }

  // Update default price & verify edit
  const { data: updatedProd, error: updateErr } = await supabase
    .from('products')
    .update({
      price: 5500,
      cost: 1500,
      is_inventory_tracked: false
    })
    .eq('id', prodId)
    .eq('user_id', userId)
    .select()
    .single();

  if (updateErr) throw new Error(`Product update failed: ${updateErr.message}`);
  console.log("✅ TEST 1 PASSED: Product default price updated to:", updatedProd.price, "PKR | Tracked:", updatedProd.is_inventory_tracked);

  // --- TEST 2: UNTRACKED SERVICE INVOICE LEDGER GUARDRAIL ---
  console.log("\n--- TEST 2: Untracked Invoice Ledger Guardrail ---");
  const lineItems = [
    {
      product_id: prodId,
      description: 'Web Design Project',
      quantity: 1,
      unit_price: 5500,
      total: 5500
    }
  ];

  const { data: invId, error: invErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
    p_user_id: userId,
    p_customer_id: null,
    p_issue_date: new Date().toISOString().split('T')[0],
    p_due_date: null,
    p_status: 'open',
    p_total_amount: 5500,
    p_receipt_url: null,
    p_line_items: lineItems,
    p_currency_code: 'PKR',
    p_exchange_rate: 1.0,
    p_original_amount: 5500
  });

  if (invErr) throw new Error(`Invoice creation failed: ${invErr.message}`);
  console.log("Created Untracked Invoice ID:", invId);

  // Approve invoice into ledger
  await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invId);

  // Query journal lines created for this invoice
  const { data: jEntries } = await supabase
    .from('journal_entries')
    .select('*, journal_lines(*, accounts(name, type))')
    .eq('reference_id', invId)
    .eq('reference_type', 'invoice');

  const lines = jEntries?.[0]?.journal_lines || [];
  console.log("Total Journal Lines Generated:", lines.length);

  lines.forEach((l, idx) => {
    console.log(`  Line ${idx + 1}: Account [${l.accounts?.name}] | Debit: ${l.debit} | Credit: ${l.credit}`);
  });

  // Verify exactly 2 lines (Debit AR, Credit Revenue)
  if (lines.length !== 2) {
    throw new Error(`FAILED: Expected exactly 2 journal lines for untracked service, but got ${lines.length}!`);
  }

  const arLine = lines.find(l => l.accounts?.name === 'Accounts Receivable');
  const revLine = lines.find(l => l.accounts?.name === 'Sales Revenue');
  const cogsLine = lines.find(l => l.accounts?.name === 'Cost of Goods Sold');
  const invAssetLine = lines.find(l => l.accounts?.name === 'Inventory Asset');

  if (!arLine || Number(arLine.debit) !== 5500) throw new Error("FAILED: Accounts Receivable Debit != 5500");
  if (!revLine || Number(revLine.credit) !== 5500) throw new Error("FAILED: Sales Revenue Credit != 5500");
  if (cogsLine || invAssetLine) throw new Error("FAILED: Untracked service unexpectedly created COGS/Inventory journal lines!");

  // Verify stock count was NOT modified
  const { data: prodAfter } = await supabase.from('products').select('inventory_count').eq('id', prodId).single();
  if (prodAfter.inventory_count !== 0) throw new Error("FAILED: inventory_count was modified for untracked service!");

  console.log("✅ TEST 2 PASSED: Untracked service generated EXACTLY 2 journal lines (Debit AR 5500, Credit Revenue 5500). Zero COGS lines created, inventory count untouched!");
  console.log("\n=== ALL ARCHITECTURAL TESTS PASSED PERFECTLY ===");
}

testUntrackedGuardrail();
