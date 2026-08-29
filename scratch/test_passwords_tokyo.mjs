import pg from 'pg';
const { Client } = pg;

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const host = 'aws-0-ap-northeast-1.pooler.supabase.com';
const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];

async function testPasswords() {
  console.log("=== TESTING PASSWORDS ON TOKYO POOLER ===");
  for (const pwd of passwords) {
    const username = `postgres.${projectRef}`;
    const connectionString = `postgres://${username}:${encodeURIComponent(pwd)}@${host}:6543/postgres`;
    console.log(`Trying password: ${pwd} ...`);
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      console.log(`🎉 SUCCESS! Password is: ${pwd}`);
      await client.end();
      return;
    } catch (e) {
      console.log(`Failed for ${pwd}:`, e.message);
      await client.end().catch(() => {});
    }
  }
  console.log("=== TEST COMPLETE ===");
}

testPasswords();
