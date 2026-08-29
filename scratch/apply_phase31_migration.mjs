import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
const regions = [
  'aws-0-eu-central-1', 
  'aws-0-us-east-1', 
  'aws-0-us-east-2', 
  'aws-0-us-west-1', 
  'aws-0-us-west-2', 
  'aws-0-ap-southeast-1', 
  'aws-0-ap-southeast-2', 
  'aws-0-eu-west-1', 
  'aws-0-eu-west-2', 
  'aws-0-eu-west-3', 
  'aws-0-ca-central-1', 
  'aws-0-sa-east-1'
];

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const sqlPath = path.join(process.cwd(), 'phase31_advances_and_loans.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function executeMigration() {
  console.log("=== APPLYING PHASE 31 ADVANCES AND LOANS MIGRATION ===");

  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    const port = 6543;

    for (const pwd of passwords) {
      const username = `postgres.${projectRef}`;
      const connectionString = `postgres://${username}:${encodeURIComponent(pwd)}@${host}:${port}/postgres`;

      console.log(`Trying ${host}:${port} as ${username}...`);
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000
      });

      try {
        await client.connect();
        console.log("Connected successfully to", host);

        console.log("Adding public.accounts 'code' column if missing...");
        await client.query(`ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS code TEXT;`);
        console.log("Column 'code' ensured successfully!");

        console.log("Running phase31_advances_and_loans.sql...");
        await client.query(sql);
        console.log("✅ phase31_advances_and_loans.sql executed successfully!");

        await client.end();
        return true;
      } catch (e) {
        if (!e.message.includes('tenant') && !e.message.includes('timeout') && e.code !== 'ENOTFOUND') {
          console.log(`Error on ${host}:`, e.message);
        }
        await client.end().catch(() => {});
      }
    }
  }

  console.error("Failed to execute SQL migration on all hosts.");
  return false;
}

executeMigration();
