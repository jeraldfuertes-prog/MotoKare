'use strict';
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const dbFile = resolve(process.env.DB_PATH || './data/motokare.sqlite');
mkdirSync(dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('rider','shop')),
 shop_name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS bikes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 model TEXT NOT NULL, year INTEGER NOT NULL, plate TEXT NOT NULL DEFAULT '',
 odometer INTEGER NOT NULL CHECK(odometer>=0), updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bikes_user ON bikes(user_id);
CREATE TABLE IF NOT EXISTS components (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
 name TEXT NOT NULL, icon TEXT NOT NULL, interval INTEGER NOT NULL CHECK(interval>0),
 last_km INTEGER NOT NULL CHECK(last_km>=0), next_km INTEGER NOT NULL CHECK(next_km>=0), due_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS components_bike ON components(bike_id);
CREATE TABLE IF NOT EXISTS services (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
 type TEXT NOT NULL, date TEXT NOT NULL, mileage INTEGER NOT NULL CHECK(mileage>=0),
 cost REAL NOT NULL CHECK(cost>=0), shop TEXT NOT NULL, notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS services_user_bike ON services(user_id,bike_id);
CREATE TABLE IF NOT EXISTS customers (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, contact TEXT NOT NULL, motorcycle TEXT NOT NULL,
 odometer INTEGER NOT NULL CHECK(odometer>=0), last_visit TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS customers_user ON customers(user_id);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 service TEXT NOT NULL, date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Pending','In Progress','Completed')),
 cost REAL NOT NULL CHECK(cost>=0)
);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id);
CREATE TABLE IF NOT EXISTS appointments (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
 service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Pending','Confirmed','Completed','Cancelled'))
);
CREATE INDEX IF NOT EXISTS appointments_user ON appointments(user_id);
`);
const stmt=(sql)=>db.prepare(sql);
const getUser = id => stmt('SELECT id,email,name,role,shop_name AS shopName FROM users WHERE id=?').get(id);
const bikeRows = id => stmt('SELECT id,model,year,plate,odometer,updated FROM bikes WHERE user_id=? ORDER BY updated DESC,id').all(id);
const componentRows = id => stmt('SELECT id,bike_id AS bikeId,name,icon,interval,last_km AS lastKm,next_km AS nextKm,due_date AS dueDate FROM components WHERE user_id=? ORDER BY rowid').all(id);
const serviceRows = id => stmt('SELECT id,bike_id AS bikeId,type,date,mileage,cost,shop,notes FROM services WHERE user_id=? ORDER BY date DESC,rowid DESC').all(id);
const customerRows = id => stmt('SELECT id,name,contact,motorcycle,odometer,last_visit AS lastVisit FROM customers WHERE user_id=? ORDER BY rowid DESC').all(id);
const jobRows = id => stmt('SELECT id,customer_id AS customerId,service,date,status,cost FROM jobs WHERE user_id=? ORDER BY date DESC,rowid DESC').all(id);
const appointmentRows = id => stmt('SELECT id,customer_id AS customerId,service,date,time,status FROM appointments WHERE user_id=? ORDER BY date,time').all(id);
function bootstrap(user) {
 return {
  version:3, role:user.role, selectedBike:null,
  session:{name:user.name,email:user.email,mode:user.role},
  bikes:user.role==='rider'?bikeRows(user.id):[],
  components:user.role==='rider'?componentRows(user.id):[],
  services:user.role==='rider'?serviceRows(user.id):[],
  customers:user.role==='shop'?customerRows(user.id):[],
  jobs:user.role==='shop'?jobRows(user.id):[],
  appointments:user.role==='shop'?appointmentRows(user.id):[],
  settings:{shopName:user.shopName||'', notifications:true,distance:'km'}
 };
}
module.exports={db,stmt,getUser,bootstrap,bikeRows,componentRows,serviceRows,customerRows,jobRows,appointmentRows};