import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Parse .env.local manually
const envConfig = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envConfig.split('\n').forEach(line => {
  const [key, val] = line.split('=');
  if (key && val) envVars[key.trim()] = val.trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== STARTING COGS & INVENTORY LEDGER VERIFICATION ===");
  try {
    // 1. Setup Auth (Create fresh user)
    const mockEmail = `cogs_qa_${Date.now()}@example.com`;
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: mockEmail,
      password: 'password123'
    });
    if (authErr) throw new Error(`Auth failed: ${authErr.message}`);
    const user = authData.user;
    console.log(`[+] Created test user: ${mockEmail} (${user.id})`);

    // 2. Setup Entities
    const { data: supp } = await supabase.from('suppliers').insert({ user_id: user.id, name: 'Inventory Supplier' }).select('id').single();
    const { data: cust } = await supabase.from('customers').insert({ user_id: user.id, name: 'Retail Customer' }).select('id').single();
    
    // 3. Setup Tracked Product
    const { data: prod } = await supabase.from('products').insert({
      user_id: user.id,
      name: 'Test Laptop',
      price: 1500.00,
      cost: 1000.00,
      inventory_count: 0,
      is_inventory_tracked: true
    }).select('*').single();
    console.log(`[+] Created product: ${prod.name} (Cost: $${prod.cost}, Price: $${prod.price}, Stock: ${prod.inventory_count})`);

    // --- TEST A: BUY INVENTORY (BILL) ---
    console.log("\n--- TEST A: PURCHASE INVENTORY ---");
    const { data: billId, error: bErr } = await supabase.rpc('create_bill_with_lines_atomic', {
      p_user_id: user.id,
      p_supplier_id: supp.id,
      p_issue_date: new Date().toISOString().split('T')[0],
      p_due_date: null,
      p_status: 'open',
      p_total_amount: 10000.00, // 10 units * $1000
      p_receipt_url: null,
      p_line_items: [{
        product_id: prod.id,
        quantity: 10,
        unit_price: 1000.00,
        amount: 10000.00,
        description: 'Buying 10 laptops'
      }]
    });
    if (bErr) throw new Error(`Bill creation failed: ${bErr.message}`);
    
    // Verify Bill
    await supabase.from('bills').update({ is_ai_verified: true }).eq('id', billId);
    
    // Check Stock
    const { data: pAfterBuy } = await supabase.from('products').select('inventory_count').eq('id', prod.id).single();
    if (pAfterBuy.inventory_count !== 10) throw new Error(`Stock mismatch! Expected 10, got ${pAfterBuy.inventory_count}`);
    console.log(`[+] Stock increased to 10 successfully.`);

    // Check Journal (Inventory Asset)
    const { data: bJe } = await supabase.from('journal_entries').select('id').eq('reference_id', billId).single();
    const { data: bJl } = await supabase.from('journal_lines').select('*, accounts(name)').eq('journal_entry_id', bJe.id);
    
    const invDebit = bJl.find(l => l.accounts.name === 'Inventory Asset' && Number(l.debit) === 10000);
    if (!invDebit) throw new Error('Missing or incorrect Inventory Asset debit on Bill.');
    console.log(`[+] Ledger correctly debited Inventory Asset by $10,000.`);

    // --- TEST B: SELL INVENTORY (INVOICE) ---
    console.log("\n--- TEST B: SELL INVENTORY ---");
    const { data: invId, error: iErr } = await supabase.rpc('create_invoice_with_lines_atomic', {
      p_user_id: user.id,
      p_customer_id: cust.id,
      p_issue_date: new Date().toISOString().split('T')[0],
      p_due_date: null,
      p_status: 'open',
      p_total_amount: 3000.00, // 2 units * $1500
      p_receipt_url: null,
      p_line_items: [{
        product_id: prod.id,
        quantity: 2,
        unit_price: 1500.00,
        total: 3000.00,
        description: 'Selling 2 laptops'
      }]
    });
    if (iErr) throw new Error(`Invoice creation failed: ${iErr.message}`);
    
    // Verify Invoice
    await supabase.from('invoices').update({ is_ai_verified: true }).eq('id', invId);

    // Check Stock
    const { data: pAfterSell } = await supabase.from('products').select('inventory_count').eq('id', prod.id).single();
    if (pAfterSell.inventory_count !== 8) throw new Error(`Stock mismatch! Expected 8, got ${pAfterSell.inventory_count}`);
    console.log(`[+] Stock decreased to 8 successfully.`);

    // Check Journal (COGS and Inventory Asset)
    const { data: iJe } = await supabase.from('journal_entries').select('id').eq('reference_id', invId).single();
    const { data: iJl } = await supabase.from('journal_lines').select('*, accounts(name)').eq('journal_entry_id', iJe.id);
    
    const cogsDebit = iJl.find(l => l.accounts.name === 'Cost of Goods Sold' && Number(l.debit) === 2000); // 2 units * $1000 cost
    const invCredit = iJl.find(l => l.accounts.name === 'Inventory Asset' && Number(l.credit) === 2000);
    
    if (!cogsDebit || !invCredit) {
      console.error(iJl);
      throw new Error('Missing or incorrect COGS/Inventory journal entries on Invoice.');
    }
    console.log(`[+] Ledger correctly debited COGS by $2,000 and credited Inventory Asset by $2,000.`);

    // --- TEST C: EDIT INVOICE (REVERSION CHECK) ---
    console.log("\n--- TEST C: EDIT INVOICE (INVENTORY REVERSION) ---");
    const { error: updErr } = await supabase.rpc('update_invoice_atomic', {
      p_invoice_id: invId,
      p_user_id: user.id,
      p_customer_id: cust.id,
      p_issue_date: new Date().toISOString().split('T')[0],
      p_due_date: null,
      p_status: 'open',
      p_total_amount: 4500.00, // Now selling 3 units
      p_receipt_url: null,
      p_line_items: [{
        product_id: prod.id,
        quantity: 3,
        unit_price: 1500.00,
        total: 4500.00,
        description: 'Selling 3 laptops'
      }]
    });
    if (updErr) throw new Error(`Invoice edit failed: ${updErr.message}`);

    // Check Stock
    const { data: pAfterEdit } = await supabase.from('products').select('inventory_count').eq('id', prod.id).single();
    if (pAfterEdit.inventory_count !== 7) throw new Error(`Stock mismatch after edit! Expected 7, got ${pAfterEdit.inventory_count}`);
    console.log(`[+] Stock properly adjusted to 7 after edit (reverted 2, deducted 3).`);

    // Check Updated Journals
    const { data: iJe2 } = await supabase.from('journal_entries').select('id').eq('reference_id', invId).single();
    const { data: iJl2 } = await supabase.from('journal_lines').select('*, accounts(name)').eq('journal_entry_id', iJe2.id);
    
    const cogsDebit2 = iJl2.find(l => l.accounts.name === 'Cost of Goods Sold' && Number(l.debit) === 3000);
    if (!cogsDebit2) throw new Error('COGS debit not updated correctly after invoice edit.');
    console.log(`[+] COGS ledger successfully adjusted to $3,000.`);

    console.log("\n=== ALL COGS & INVENTORY VALIDATIONS PASSED ===");
    
  } catch (err) {
    console.error("\n[X] TEST FAILED:", err.message);
    process.exit(1);
  }
}

run();
