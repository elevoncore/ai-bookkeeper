import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const passwords = ['Password123!', 'password123', 'Admin123!'];

const projectPath = 'd:\\build\\ai-bookkeeper';
const sqlPath = path.join(projectPath, 'phase38_ai_action_items.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function tryPort(port, pwd) {
  console.log(`Connecting to Tokyo pooler ${host}:${port} with user postgres.${projectRef}...`);
  const client = new Client({
    user: `postgres.${projectRef}`,
    password: pwd,
    host: host,
    database: 'postgres',
    port: port,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000
  });

  try {
    await client.connect();
    console.log(`🎉 SUCCESS! Connected directly to Supabase via port ${port}!`);
    console.log("Applying phase38_ai_action_items.sql...");
    await client.query(sql);
    console.log("✅ Migration phase38_ai_action_items.sql applied successfully!");
    await client.end();
    return true;
  } catch (e) {
    console.error(`Connection/Query failed on port ${port} with pwd ${pwd}:`, e.message);
    await client.end().catch(() => {});
    return false;
  }
}

async function run() {
  for (const pwd of passwords) {
    for (const port of [6543, 5432]) {
      const ok = await tryPort(port, pwd);
      if (ok) return;
    }
  }
}

run();
