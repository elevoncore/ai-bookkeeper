import fs from 'fs';
import path from 'path';
import { runQuery } from './execute_sql_direct.mjs';

const sqlPath = path.join('d:\\build\\ai-bookkeeper', 'phase35_invoice_custom_account_support.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

console.log("Applying phase35_invoice_custom_account_support.sql direct...");
runQuery(sql).then(res => {
  console.log("Migration applied successfully!");
}).catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
