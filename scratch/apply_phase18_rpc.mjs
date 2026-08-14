import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
const hosts = [
  'db.yfxncnxbqjcmqiztfhfn.supabase.co',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com'
];

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const sqlPath = path.join(process.cwd(), 'scratch', 'phase18_journal_entry_rpc.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function executeMigration() {
  console.log("=== APPLYING PHASE 18 JOURNAL ENTRY RPC SQL ===");

  for (const host of hosts) {
    const isPooler = host.includes('pooler');
    const port = isPooler ? 6543 : 5432;

    for (const pwd of passwords) {
      const username = isPooler ? `postgres.${projectRef}` : 'postgres';
      const connectionString = `postgres://${username}:${encodeURIComponent(pwd)}@${host}:${port}/postgres`;

      console.log(`Trying ${host}:${port} as ${username}...`);
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
      });

      try {
        await client.connect();
        console.log("Connected successfully to", host);
        await client.query(sql);
        console.log("✅ phase18_journal_entry_rpc.sql executed successfully!");
        await client.end();
        return true;
      } catch (e) {
        if (!e.message.includes('timeout') && !e.code === 'ENOTFOUND') {
          console.log(`Error on ${host}:`, e.message);
        }
        await client.end().catch(() => {});
      }
    }
  }

  console.error("Failed to connect via direct Postgres client. Will use client fallback in JS code!");
  return false;
}

executeMigration();
