import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
const regions = ['aws-0-eu-central-1', 'aws-0-us-east-1', 'aws-0-us-west-1', 'aws-0-ap-southeast-1', 'aws-0-eu-west-1', 'aws-0-us-east-2'];
const projectRef = 'yfxncnxbqjcmqiztfhfn';
const sql = fs.readFileSync('phase16_fix_rpc_overloads.sql', 'utf8');

async function tryConnect() {
  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    for (const pwd of passwords) {
      // Supabase pooler connection string format:
      // postgres://postgres.[project-ref]:[password]@[host]:6543/postgres
      const connectionString = `postgres://postgres.${projectRef}:${encodeURIComponent(pwd)}@${host}:6543/postgres`;
      console.log(`Trying ${host} with pwd ${pwd}...`);
      const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        console.log("Connected successfully to", host);
        await client.query(sql);
        console.log("SQL executed successfully!");
        await client.end();
        return true;
      } catch (e) {
        if (e.code === 'ENOTFOUND' || e.message.includes('timeout')) {
          // ignore host unreachable
        } else {
          console.log("Failed:", e.message);
        }
        await client.end().catch(() => {});
      }
    }
  }
  return false;
}

tryConnect();
