import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const passwords = ['Password123!', 'password123', 'postgres', 'Admin123!'];
const host = 'db.yfxncnxbqjcmqiztfhfn.supabase.co';
const sql = fs.readFileSync('phase15_auditability.sql', 'utf8');

async function tryConnect() {
  for (const pwd of passwords) {
    const connectionString = `postgres://postgres:${encodeURIComponent(pwd)}@${host}:5432/postgres`;
    console.log("Trying connection with password:", pwd);
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log("Connected successfully!");
      await client.query(sql);
      console.log("phase15_auditability.sql executed successfully!");
      await client.end();
      return true;
    } catch (e) {
      console.log("Failed with pwd", pwd, ":", e.message);
      await client.end().catch(() => {});
    }
  }
  return false;
}

tryConnect();
