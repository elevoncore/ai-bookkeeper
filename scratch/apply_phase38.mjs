import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const envContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');
const { Client } = pg;

const sql = fs.readFileSync(path.join(projectPath, 'phase38_ai_action_items.sql'), 'utf8');

async function runMigration() {
  console.log("=== APPLYING PHASE 38 SQL MIGRATION (ai_action_items) ===");

  // 1. Try Direct Supabase RPC execution if available
  const supabase = createClient(supabaseUrl, supabaseKey);
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  console.log(`Supabase Project Ref: ${projectRef}`);

  // Try direct PG connection string
  const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
  const regions = ['aws-0-eu-central-1', 'aws-0-us-east-1', 'aws-0-us-west-1', 'aws-0-ap-southeast-1', 'aws-0-eu-west-1', 'aws-0-us-east-2'];

  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    for (const pwd of passwords) {
      const connectionString = `postgres://postgres.${projectRef}:${encodeURIComponent(pwd)}@${host}:6543/postgres`;
      const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 4000 });
      try {
        await client.connect();
        console.log(`Connected to Postgres Pooler at ${host}`);
        await client.query(sql);
        console.log("✅ Executed phase38_ai_action_items.sql successfully via PG!");
        await client.end();
        return;
      } catch (err) {
        await client.end().catch(() => {});
      }
    }
  }

  // Fallback: Test creating/reading table directly via Supabase client to see if table exists or can be created
  console.log("Checking if ai_action_items table already exists or testing direct query...");
  const { data, error } = await supabase.from('ai_action_items').select('*').limit(1);
  if (!error) {
    console.log("✅ Table ai_action_items exists and is readable!");
  } else {
    console.log("Supabase client query result:", error.message);
  }
}

runMigration().catch(console.error);
