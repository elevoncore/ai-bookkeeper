// Automated Backend & AI Brain Settings Audit Script
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yfxncnxbqjcmqiztfhfn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ybp9eVFfwMq1u5ScVIjykA_fotc-vEY';
const TEST_EMAIL = 'testuser@aibookkeeper.com';
const TEST_PASSWORD = 'Password123!';
const BASE_URL = 'http://localhost:3001';

async function runAudit() {
  console.log("=================================================");
  console.log("🚀 STARTING USER SETTINGS & AI BRAIN INJECTION AUDIT");
  console.log("=================================================\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // 1. Authenticate test user
  console.log("1️⃣ Authenticating test user...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (authError || !authData.session) {
    throw new Error(`Authentication failed: ${authError?.message}`);
  }

  const token = authData.session.access_token;
  const userId = authData.user.id;
  console.log(`✅ Authenticated as ${TEST_EMAIL} (UID: ${userId.substring(0, 8)})\n`);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // 2. Test GET /api/settings
  console.log("2️⃣ Testing GET /api/settings...");
  const getRes = await fetch(`${BASE_URL}/api/settings`, { headers });
  if (!getRes.ok) throw new Error(`GET /api/settings returned status ${getRes.status}`);
  const getData = await getRes.json();
  console.log("   Initial Settings:", getData.settings);
  if (!getData.settings) throw new Error("GET /api/settings missing settings payload");
  console.log("✅ GET /api/settings passed!\n");

  // 3. Test POST /api/settings -> Set to Permissive + USD
  console.log("3️⃣ Updating Settings to Permissive Mode + USD...");
  const postRes1 = await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      currency: 'USD',
      ai_ambiguity_strictness: 'permissive',
      ai_require_manual_verification: true,
      ai_strict_cogs_realization: true
    })
  });
  if (!postRes1.ok) throw new Error(`POST /api/settings failed: ${postRes1.status}`);
  const postData1 = await postRes1.json();
  console.log("   Updated Settings:", postData1.settings);
  if (postData1.settings.currency !== 'USD' || postData1.settings.ai_ambiguity_strictness !== 'permissive') {
    throw new Error("Settings update mismatch");
  }
  console.log("✅ Permissive settings persisted successfully!\n");

  // 4. Test AI Brain Extraction under Permissive Mode
  console.log("4️⃣ Testing AI Brain in Permissive Mode (Prompt: 'I bought a table for 5000 USD.')...");
  const extractRes1 = await fetch(`${BASE_URL}/api/extract`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'I bought a table for 5000 USD.',
      chartOfAccounts: [
        { name: 'Main Bank Account', type: 'asset' },
        { name: 'General Operating Expense', type: 'expense' },
        { name: 'Fixed Assets - Office/Equipment', type: 'asset' },
        { name: 'Accounts Payable', type: 'liability' }
      ]
    })
  });

  if (!extractRes1.ok) throw new Error(`Extract route failed: ${extractRes1.status}`);
  const extractData1 = await extractRes1.json();
  console.log("   AI Response (Permissive):", {
    intent: extractData1.intent,
    is_complete: extractData1.is_complete,
    clarification_question: extractData1.clarification_question,
    conversational_response: extractData1.conversational_response,
    line_items: extractData1.line_items
  });

  if (extractData1.is_complete !== true) {
    throw new Error(`Expected is_complete === true under Permissive mode, but got ${extractData1.is_complete}`);
  }
  console.log("✅ Permissive Mode Bypassed Ambiguity Trap as expected!\n");

  // 5. Test POST /api/settings -> Set to Strict + PKR
  console.log("5️⃣ Updating Settings back to Strict Mode + PKR...");
  const postRes2 = await fetch(`${BASE_URL}/api/settings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      currency: 'PKR',
      ai_ambiguity_strictness: 'strict',
      ai_require_manual_verification: true,
      ai_strict_cogs_realization: true
    })
  });
  if (!postRes2.ok) throw new Error(`POST /api/settings failed: ${postRes2.status}`);
  const postData2 = await postRes2.json();
  console.log("   Updated Settings:", postData2.settings);
  if (postData2.settings.currency !== 'PKR' || postData2.settings.ai_ambiguity_strictness !== 'strict') {
    throw new Error("Settings update mismatch");
  }
  console.log("✅ Strict settings persisted successfully!\n");

  // 6. Test AI Brain Extraction under Strict Mode
  console.log("6️⃣ Testing AI Brain in Strict Mode (Prompt: 'I bought a table for 5000 PKR.')...");
  const extractRes2 = await fetch(`${BASE_URL}/api/extract`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: 'I bought a table for 5000 PKR.',
      chartOfAccounts: [
        { name: 'Main Bank Account', type: 'asset' },
        { name: 'General Operating Expense', type: 'expense' },
        { name: 'Fixed Assets - Office/Equipment', type: 'asset' },
        { name: 'Accounts Payable', type: 'liability' }
      ]
    })
  });

  if (!extractRes2.ok) throw new Error(`Extract route failed: ${extractRes2.status}`);
  const extractData2 = await extractRes2.json();
  console.log("   AI Response (Strict):", {
    intent: extractData2.intent,
    is_complete: extractData2.is_complete,
    clarification_question: extractData2.clarification_question,
    conversational_response: extractData2.conversational_response
  });

  if (extractData2.is_complete !== false || !extractData2.clarification_question) {
    throw new Error(`Expected is_complete === false & clarification question under Strict mode, but got is_complete=${extractData2.is_complete}`);
  }
  console.log("✅ Strict Mode Triggered Ambiguity Trap and Asked Clarification!\n");

  console.log("=================================================");
  console.log("🏆 ALL 6/6 BACKEND & AI INJECTION TESTS PASSED!");
  console.log("=================================================");
}

runAudit().catch(err => {
  console.error("❌ AUDIT FAILED:", err);
  process.exit(1);
});
