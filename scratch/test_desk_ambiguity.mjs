import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envConfig = fs.readFileSync('.env.local', 'utf8');
const env = {};
envConfig.split('\n').forEach(line => {
  const [k, v] = line.split('=');
  if (k && v) env[k.trim()] = v.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDeskAmbiguity() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'testuser@aibookkeeper.com',
    password: 'Password123!'
  });

  if (authErr) {
    console.error("Sign in failed:", authErr);
    return;
  }

  const token = authData.session.access_token;

  try {
    const res = await fetch('http://localhost:3001/api/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt: 'I just bought a 50,000 PKR desk.' })
    });
    const data = await res.json();
    console.log("Extraction Response:", JSON.stringify(data, null, 2));
    if (data.is_complete === false && data.conversational_response) {
      console.log("\n========================================================");
      console.log(">>> TEST 9 PASSED: Ambiguity rule triggered correctly! <<<");
      console.log("Clarification Question:", data.clarification_question || data.conversational_response);
      console.log("========================================================");
    } else {
      console.log("\n>>> TEST 9 FAILED: is_complete is", data.is_complete, "<<<");
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

testDeskAmbiguity();
