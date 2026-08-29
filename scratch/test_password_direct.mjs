import pg from 'pg';
const { Client } = pg;

const passwords = [
  'Password123!',
  'Password123',
  'password123!',
  'password123',
  'postgres',
  'Admin123!',
  'Kashan123!',
  'kashan123!'
];

async function testDirect() {
  console.log("=== TESTING DIRECT PORTS 5432 & 6543 ===");
  const host = 'db.yfxncnxbqjcmqiztfhfn.supabase.co';
  
  for (const port of [5432, 6543]) {
    for (const pwd of passwords) {
      console.log(`Trying ${host}:${port} with pwd ${pwd}...`);
      const client = new Client({
        user: 'postgres',
        host,
        database: 'postgres',
        password: pwd,
        port,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 2000
      });

      try {
        await client.connect();
        console.log(`🎉 SUCCESS on port ${port}! Password is: ${pwd}`);
        await client.end();
        return;
      } catch (e) {
        console.log(`Failed for port ${port}, pwd ${pwd}:`, e.message);
        await client.end().catch(() => {});
      }
    }
  }
  console.log("=== TEST COMPLETE ===");
}

testDirect();
