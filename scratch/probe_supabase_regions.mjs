import pg from 'pg';
const { Client } = pg;

const projectRef = 'yfxncnxbqjcmqiztfhfn';
const regions = [
  'aws-0-us-east-1',
  'aws-0-us-east-2',
  'aws-0-us-west-1',
  'aws-0-us-west-2',
  'aws-0-eu-central-1',
  'aws-0-eu-west-1',
  'aws-0-eu-west-2',
  'aws-0-eu-west-3',
  'aws-0-ap-southeast-1',
  'aws-0-ap-southeast-2',
  'aws-0-ap-northeast-1',
  'aws-0-ap-northeast-2',
  'aws-0-ap-south-1',
  'aws-0-sa-east-1',
  'aws-0-ca-central-1'
];

async function probe() {
  console.log("=== PROBING SUPABASE REGIONS ===");
  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    const connectionString = `postgres://postgres.${projectRef}:Password123!@${host}:6543/postgres`;
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });

    try {
      await client.connect();
      console.log(`Connected successfully to ${host}!`);
      await client.end();
      return;
    } catch (e) {
      // If tenant not found or ENOTFOUND, ignore it.
      // If it says "password authentication failed", it means the tenant was found on this region!
      if (!e.message.includes('tenant') && e.code !== 'ENOTFOUND' && !e.message.includes('timeout')) {
        console.log(`Region ${region} responded with:`, e.message);
      }
      await client.end().catch(() => {});
    }
  }
  console.log("=== PROBE COMPLETE ===");
}

probe();
