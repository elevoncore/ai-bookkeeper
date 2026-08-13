import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { findBestAccountMatch } from '../src/utils/fuzzyMatch.ts';

// Read .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) {
      process.env[key.trim()] = val.trim();
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runStressTestSuite() {
  console.log("=================================================");
  console.log("🔥 STRESS TEST SUITE: EXPENSE CATEGORIZATION & FUZZY MATCHING");
  console.log("=================================================\n");

  // 1. Test Fuzzy String Matching directly
  console.log("--- UNIT TEST: FUZZY MATCHING (Levenshtein Distance) ---");
  const candidates = [
    { id: '1', name: 'Main Bank Account' },
    { id: '2', name: 'Petty Cash' },
    { id: '3', name: 'Utilities' },
    { id: '4', name: 'Software & Hosting' },
    { id: '5', name: 'Rent Expense' },
    { id: '6', name: 'General Operating Expense' },
    { id: '7', name: 'Cost of Goods Sold' }
  ];

  const typo1 = findBestAccountMatch('utilites', candidates, 0.55);
  console.log(`Typo 'utilites' -> Matched: "${typo1?.account.name}" (Score: ${typo1?.score.toFixed(2)})`);

  const typo2 = findBestAccountMatch('softwares', candidates, 0.55);
  console.log(`Typo 'softwares' -> Matched: "${typo2?.account.name}" (Score: ${typo2?.score.toFixed(2)})`);

  const typo3 = findBestAccountMatch('office snacks and stuff', candidates, 0.50);
  console.log(`Ambiguous 'office snacks and stuff' -> Matched: "${typo3?.account.name || 'Fallback to General Operating Expense'}"`);

  console.log("\n--- API STRESS TESTS (Gemini Prompt & Extraction Pipeline) ---");

  // Fetch a test user session or login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authError || !authData.user) {
    console.error("Auth failed for stress test:", authError?.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(` Authenticated test user: ${authData.user.email} (${userId})`);

  // Define 4 Test Scenarios
  const scenarios = [
    {
      name: "Test 1 (Ambiguity)",
      prompt: "I spent 5,000 PKR on random office stuff and snacks.",
      expectedCategory: "General Operating Expense"
    },
    {
      name: "Test 2 (Multi-Line Mixed)",
      prompt: "I paid my 20,000 PKR rent and a 5,000 PKR AWS bill together.",
      expectedCategory: ["Rent Expense", "Software & Hosting"]
    },
    {
      name: "Test 3 (Typo/Fuzzy Match)",
      prompt: "I paid 2,000 for utilites and water.",
      expectedCategory: "Utilities"
    },
    {
      name: "Test 4 (Out of Scope / Large Unmapped Expense)",
      prompt: "I bought a company car for 500,000 PKR.",
      expectedCategory: "General Operating Expense"
    }
  ];

  for (const s of scenarios) {
    console.log(`\n-------------------------------------------------`);
    console.log(`🧪 Running ${s.name}`);
    console.log(`Prompt: "${s.prompt}"`);

    try {
      const res = await fetch('http://localhost:3001/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`
        },
        body: JSON.stringify({
          prompt: s.prompt,
          image: null,
          history: []
        })
      });

      const json = await res.json();
      if (json.extracted) {
        const extracted = json.extracted;
        console.log(` Intent: ${extracted.intent}`);
        console.log(` Line Items Count: ${extracted.line_items?.length || 0}`);

        if (extracted.line_items) {
          extracted.line_items.forEach((item, idx) => {
            console.log(`   Line ${idx + 1}: "${item.description}" | Total: ${item.total} PKR | Account Extracted: "${item.account_name}"`);
            
            // Perform fuzzy match test on account_name
            const match = findBestAccountMatch(item.account_name || '', candidates, 0.50);
            console.log(`   -> Resolved Account ID: "${match?.account.name || 'General Operating Expense'}"`);
          });
        }
      } else {
        console.log(`Response:`, json);
      }
    } catch (err) {
      console.error(` Error testing ${s.name}:`, err.message);
    }
  }

  console.log(`\n=================================================`);
  console.log("STRESS TEST SUITE COMPLETE");
  console.log("=================================================\n");
}

runStressTestSuite();
