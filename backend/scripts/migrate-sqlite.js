'use strict';
// One-time import from the old MotoKare SQLite database into PostgreSQL.
// Preserves existing UUIDs, users/password hashes, and maintenance/shop records.
// Old sessions are intentionally not transferred: users sign in again.
const { DatabaseSync } = require('node:sqlite');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { transaction, ready, pool } = require('../db');

const file = resolve(process.argv[2] || './data/motokare.sqlite');
const tables = [
  ['users', 'id,email,name,password_hash,role,shop_name'],
  ['bikes', 'id,user_id,model,year,plate,odometer,updated'],
  ['components', 'id,user_id,bike_id,name,icon,interval,last_km,next_km,due_date'],
  ['services', 'id,user_id,bike_id,type,date,mileage,cost,shop,notes'],
  ['customers', 'id,user_id,name,contact,motorcycle,odometer,last_visit'],
  ['jobs', 'id,user_id,customer_id,service,date,status,cost'],
  ['appointments', 'id,user_id,customer_id,service,date,time,status'],
];

async function main() {
  if (!existsSync(file)) throw new Error(`SQLite file not found: ${file}`);
  await ready;
  const sqlite = new DatabaseSync(file, { readOnly:true });
  try {
    const summary = await transaction(async tx => {
      const imported = {};
      for (const [table, csv] of tables) {
        const columns = csv.split(',');
        const values = sqlite.prepare(`SELECT ${csv} FROM ${table} ORDER BY rowid`).all();
        let changes = 0;
        for (const row of values) {
          const args = columns.map(name => table==='users' && name==='email' ? String(row[name]).toLowerCase() : row[name]);
          const slots = columns.map(() => '?').join(',');
          const result = await tx(`INSERT INTO ${table} (${csv}) VALUES (${slots}) ON CONFLICT (id) DO NOTHING`).run(...args);
          changes += result.changes;
        }
        imported[table] = changes;
      }
      return imported;
    });
    console.log('SQLite → PostgreSQL import completed:', summary);
    console.log('Previous sessions were not imported. All users must sign in again.');
  } finally { sqlite.close(); }
}
main().catch(error => { console.error('Import failed (transaction rolled back):', error); process.exitCode = 1; }).finally(() => pool.end());