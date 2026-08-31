import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const pwd = 'Password123!';

async function tryPort(port) {
  console.log(`Connecting to Tokyo pooler ${host} on port ${port} with user postgres.${projectRef}...`);
  const client = new Client({
    user: `postgres.${projectRef}`,
    password: pwd,
    host: host,
    database: 'postgres',
    port: port,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    console.log(`🎉 SUCCESS! Connected directly to Supabase via port ${port}!`);
    
    // Run the migration since we are connected!
    const sqlPath = 'd:\\build\\ai-bookkeeper\\phase35_invoice_custom_account_support.sql';
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log("Migration applied successfully!");
    
    await client.end();
    return true;
  } catch (e) {
    console.error(`Connection failed on port ${port}:`, e.message);
    await client.end().catch(() => {});
    return false;
  }
}

async function run() {
  const ok5432 = await tryPort(5432);
  if (!ok5432) {
    await tryPort(6543);
  }
}

run();
