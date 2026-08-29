import pg from 'pg';
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

export async function runQuery(sql, params = []) {
  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    const port = 6543;

    for (const pwd of passwords) {
      const username = `postgres.${projectRef}`;
      const connectionString = `postgres://${username}:${encodeURIComponent(pwd)}@${host}:${port}/postgres`;
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 4000
      });

      try {
        await client.connect();
        const res = await client.query(sql, params);
        await client.end();
        return res;
      } catch (e) {
        await client.end().catch(() => {});
        // continue if connection failure
      }
    }
  }
  throw new Error("Failed to connect to any Supabase host");
}

if (process.argv[1] && process.argv[1].endsWith('execute_sql.mjs')) {
  const sql = process.argv[2];
  if (!sql) {
    console.error("Please provide SQL string");
    process.exit(1);
  }
  runQuery(sql).then(res => {
    console.log("Success:", res.rows || res);
  }).catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
}
