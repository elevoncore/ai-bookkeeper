import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');

async function testColumn() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  const userId = authData.user.id;

  // Check Long-Term Debt ID
  const { data: ltDebt } = await supabase.from('accounts').select('id, name').eq('user_id', userId).eq('name', 'Long-Term Debt').single();
  console.log("Long-Term Debt account:", ltDebt);

  // Attempt to create Askari Bank account if not exists
  const { data: askariCheck } = await supabase.from('accounts').select('*').eq('user_id', userId).ilike('name', '%Askari%');
  let askariId;
  if (!askariCheck || askariCheck.length === 0) {
    console.log("Creating 'Askari Bank' liability account...");
    const { data: newAskari, error: insErr } = await supabase.from('accounts').insert({
      user_id: userId,
      name: 'Askari Bank',
      type: 'liability',
      is_system: false,
      is_cash_account: false,
      parent_id: ltDebt?.id
    }).select().single();
    if (insErr) {
      console.error("Failed to insert Askari Bank:", insErr);
    } else {
      console.log("Created Askari Bank:", newAskari);
      askariId = newAskari.id;
    }
  } else {
    askariId = askariCheck[0].id;
    console.log("Existing Askari Bank:", askariCheck[0]);
  }

  // Try setting parent_account_id
  if (askariId && ltDebt) {
    const { error: updErr } = await supabase.from('accounts').update({
      is_cash_account: false,
      parent_id: ltDebt.id
    }).eq('id', askariId);
    console.log("Updated parent_id:", updErr ? updErr.message : "SUCCESS");

    const { error: updErr2 } = await supabase.from('accounts').update({
      parent_account_id: ltDebt.id
    }).eq('id', askariId);
    console.log("Updated parent_account_id:", updErr2 ? updErr2.message : "SUCCESS");
  }

  const { data: finalAskari } = await supabase.from('accounts').select('*').eq('id', askariId).single();
  console.log("Final Askari record in DB:", finalAskari);
}

testColumn().catch(console.error);
