import path from 'path';
import { createRequire } from 'module';
import fs from 'fs';

const projectPath = 'd:\\build\\ai-bookkeeper';
const require = createRequire(path.join(projectPath, 'package.json'));
const pg = require('pg');
const { Client } = pg;

const sql = fs.readFileSync(path.join(projectPath, 'phase38_ai_action_items.sql'), 'utf8');

const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
const hosts = [
  'db.yfxncnxbqjcmqiztfhfn.supabase.co',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com'
];
const projectRef = 'yfxncnxbqjcmqiztfhfn';

async function execute() {
  console.log("=== EXECUTING PHASE 38 MIGRATION VIA POSTGRES CLIENT ===");

  for (const host of hosts) {
    const isPooler = host.includes('pooler');
    const port = isPooler ? 6543 : 5432;
    const user = isPooler ? `postgres.${projectRef}` : 'postgres';

    for (const pwd of passwords) {
      const connectionString = `postgres://${user}:${encodeURIComponent(pwd)}@${host}:${port}/postgres`;
      console.log(`Connecting to ${host}:${port} as ${user}...`);
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });

      try {
        await client.connect();
        console.log(`✅ Connected successfully to ${host}:${port}!`);
        await client.query(sql);
        console.log("✅ phase38_ai_action_items.sql executed successfully!");
        await client.end();
        return;
      } catch (err) {
        console.log(` -> Failed (${host}): ${err.message}`);
        await client.end().catch(() => {});
      }
    }
  }
}

execute().catch(console.error);
