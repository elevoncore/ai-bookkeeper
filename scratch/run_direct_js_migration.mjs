import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function run() {
  console.log("=== RUNNING DIRECT JS DATABASE CONSOLIDATION ===");
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({email: 'testuser@aibookkeeper.com', password: 'Password123!'});
  const userId = authData.user.id;

  const { data: accounts, error: accErr } = await supabase.from('accounts').select('*').eq('user_id', userId);
  if (accErr) {
    console.error("Failed to load accounts:", accErr);
    process.exit(1);
  }

  // Helper to find or create an account
  async function ensureAccount(name, type, isCash = false) {
    let acc = accounts.find(a => a.name === name);
    if (!acc) {
      console.log(`Creating account: ${name} (${type})...`);
      const { data, error } = await supabase.from('accounts').insert({
        user_id: userId,
        name,
        type,
        is_system: true,
        is_cash_account: isCash
      }).select().single();
      if (error) {
        console.error(`Failed to create account ${name}:`, error.message);
      } else {
        acc = data;
        accounts.push(data);
      }
    }
    return acc;
  }

  // Ensure SME Equity accounts exist
  const capitalAcc = await ensureAccount("Owner's Capital", "equity");
  const drawingsAcc = await ensureAccount("Owner's Drawings", "equity");
  const invAssetAcc = await ensureAccount("Inventory Asset", "asset");

  // 1. Migrate Owners Equity -> Owner's Capital
  const ownersEquityAcc = accounts.find(a => a.name === 'Owners Equity');
  if (ownersEquityAcc && capitalAcc) {
    console.log(`Migrating journal lines from Owners Equity (${ownersEquityAcc.id}) to Owner's Capital (${capitalAcc.id})...`);
    const { error: jErr } = await supabase.from('journal_lines').update({ account_id: capitalAcc.id }).eq('account_id', ownersEquityAcc.id);
    if (jErr) console.warn("Journal lines update warn:", jErr.message);
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', ownersEquityAcc.id);
    if (delErr) console.warn("Delete old Owners Equity account warn:", delErr.message);
  }

  // 2. Migrate Owner Drawings -> Owner's Drawings
  const ownerDrawingsOld = accounts.find(a => a.name === 'Owner Drawings');
  if (ownerDrawingsOld && drawingsAcc) {
    console.log(`Migrating journal lines from Owner Drawings (${ownerDrawingsOld.id}) to Owner's Drawings (${drawingsAcc.id})...`);
    const { error: jErr } = await supabase.from('journal_lines').update({ account_id: drawingsAcc.id }).eq('account_id', ownerDrawingsOld.id);
    if (jErr) console.warn("Journal lines update warn:", jErr.message);
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', ownerDrawingsOld.id);
    if (delErr) console.warn("Delete old Owner Drawings account warn:", delErr.message);
  }

  // 3. Migrate Retained Earnings -> Owner's Capital
  const retainedAcc = accounts.find(a => a.name === 'Retained Earnings');
  if (retainedAcc && capitalAcc) {
    console.log(`Migrating journal lines from Retained Earnings (${retainedAcc.id}) to Owner's Capital (${capitalAcc.id})...`);
    const { error: jErr } = await supabase.from('journal_lines').update({ account_id: capitalAcc.id }).eq('account_id', retainedAcc.id);
    if (jErr) console.warn("Journal lines update warn:", jErr.message);
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', retainedAcc.id);
    if (delErr) console.warn("Delete Retained Earnings account warn:", delErr.message);
  }

  // 4. Consolidate Inventory (expense) -> Inventory Asset (asset)
  const inventoryOld = accounts.find(a => a.name === 'Inventory' && a.type === 'expense');
  if (inventoryOld && invAssetAcc) {
    console.log(`Consolidating Inventory (${inventoryOld.id}) to Inventory Asset (${invAssetAcc.id})...`);
    // update journal lines
    const { error: jErr } = await supabase.from('journal_lines').update({ account_id: invAssetAcc.id }).eq('account_id', inventoryOld.id);
    if (jErr) console.warn("Journal lines update warn:", jErr.message);
    
    // update bill lines
    const { error: bErr } = await supabase.from('bill_lines').update({ account_id: invAssetAcc.id }).eq('account_id', inventoryOld.id);
    if (bErr) console.warn("Bill lines update warn:", bErr.message);

    // update invoice lines
    const { error: iErr } = await supabase.from('invoice_lines').update({ account_id: invAssetAcc.id }).eq('account_id', inventoryOld.id);
    if (iErr) console.warn("Invoice lines update warn:", iErr.message);

    // delete redundant account
    const { error: delErr } = await supabase.from('accounts').delete().eq('id', inventoryOld.id);
    if (delErr) console.warn("Delete old Inventory account warn:", delErr.message);
  }

  console.log("✓ Database consolidation complete!");
}

run();
