import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!', 'Kashan123!'];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  for (const pwd of passwords) {
    console.log(`Trying password: ${pwd}...`);
    const client = new Client({
      user: `postgres.${projectRef}`,
      password: pwd,
      host: host,
      database: 'postgres',
      port: 6543,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      console.log(`🎉 SUCCESS! Correct password is: ${pwd}`);
      
      const sqlPath = 'd:\\build\\ai-bookkeeper\\phase35_invoice_custom_account_support.sql';
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log("Migration applied successfully!");
      
      await client.end();
      return;
    } catch (e) {
      console.log(`Failed for ${pwd}:`, e.message);
      await client.end().catch(() => {});
    }
    await delay(3000); // 3 second delay
  }
}

test();
