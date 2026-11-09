'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and start PostgreSQL.');
}
const pgSchema = process.env.PG_SCHEMA || 'public';
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(pgSchema)) {
  throw new Error('Invalid PG_SCHEMA identifier');
}
const pool = new Pool({
  connectionString,
  max: 12,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  options: `-c search_path=${pgSchema},public`,
});
pool.on('error', error => console.error('[MotoKare PostgreSQL] idle pool error:', error));

// '?' placeholders are only used in fixed, application-owned SQL statements.
const positional = sql => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
function stmt(sql, executor = pool) {
  const statement = positional(sql);
  const execute = values => executor.query(statement, values);
  return {
    async get(...values) { return (await execute(values)).rows[0]; },
    async all(...values) { return (await execute(values)).rows; },
    async run(...values) { const result = await execute(values); return { changes: result.rowCount }; },
  };
}
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(sql => stmt(sql, client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Rollback error:', rollbackError); }
    throw err;
  } finally { client.release(); }
}
async function initDatabase() {
  const client = await pool.connect();
  try {
    if (pgSchema !== 'public') await client.query(`CREATE SCHEMA IF NOT EXISTS "${pgSchema}"`);
    await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    await client.query('SELECT 1');
  } finally { client.release(); }
}
const ready = initDatabase();
const getUser = id => stmt('SELECT id,email,name,role,shop_name AS "shopName" FROM users WHERE id=?').get(id);
const bikeRows = id => stmt('SELECT id,model,year,plate,odometer,updated FROM bikes WHERE user_id=? ORDER BY updated DESC,row_seq DESC').all(id);
const componentRows = id => stmt('SELECT id,bike_id AS "bikeId",name,icon,interval,last_km AS "lastKm",next_km AS "nextKm",due_date AS "dueDate",interval_days AS "intervalDays",last_service_date AS "lastServiceDate" FROM components WHERE user_id=? ORDER BY row_seq').all(id);
const serviceRows = id => stmt('SELECT id,bike_id AS "bikeId",type,date,mileage,cost,shop,notes FROM services WHERE user_id=? ORDER BY date DESC,row_seq DESC').all(id);
const customerRows = id => stmt('SELECT id,name,contact,motorcycle,odometer,last_visit AS "lastVisit" FROM customers WHERE user_id=? ORDER BY row_seq DESC').all(id);
const jobRows = id => stmt('SELECT id,customer_id AS "customerId",service,date,status,cost FROM jobs WHERE user_id=? ORDER BY date DESC,row_seq DESC').all(id);
const appointmentRows = id => stmt('SELECT id,customer_id AS "customerId",service,date,time,status FROM appointments WHERE user_id=? ORDER BY date,time').all(id);
const shopRows = ({query='',city='',service=''}={}) => stmt(`SELECT id,shop_name AS "shopName",shop_city AS city,shop_address AS address,shop_description AS description,services_offered AS services FROM users
 WHERE role=?
 AND (?='' OR shop_name ILIKE '%'||?||'%' OR shop_city ILIKE '%'||?||'%' OR shop_description ILIKE '%'||?||'%' OR shop_address ILIKE '%'||?||'%')
 AND (?='' OR shop_city ILIKE '%'||?||'%')
 AND (?='' OR ?=ANY(services_offered))
 ORDER BY CASE WHEN shop_city='' THEN 1 ELSE 0 END,shop_name,id LIMIT 100`).all('shop',query,query,query,query,query,city,city,service,service);
const shopProfile = id => stmt('SELECT shop_city AS city,shop_address AS address,shop_description AS description,services_offered AS services FROM users WHERE id=? AND role=?').get(id,'shop');
// Only account names and status are exposed. No email, bikes, services or customer records.
const connectionRows = user => stmt('SELECT c.id,c.rider_id AS "riderId",c.shop_id AS "shopId",c.status,c.created_at AS "createdAt",s.shop_name AS "shopName",r.name AS "riderName" FROM account_connections c JOIN users s ON s.id=c.shop_id AND s.role=? JOIN users r ON r.id=c.rider_id AND r.role=? WHERE '+(user.role==='rider'?'c.rider_id=?':'c.shop_id=?')+' ORDER BY c.created_at DESC,c.id DESC').all('shop','rider',user.id);
async function bootstrap(user) {
  const rider = user.role === 'rider';
  const [bikes, components, services, customers, jobs, appointments, shops, connections, profile] = await Promise.all([
    rider ? bikeRows(user.id) : [],
    rider ? componentRows(user.id) : [],
    rider ? serviceRows(user.id) : [],
    !rider ? customerRows(user.id) : [],
    !rider ? jobRows(user.id) : [],
    !rider ? appointmentRows(user.id) : [],
    rider ? shopRows() : [],
    connectionRows(user),
    rider ? null : shopProfile(user.id),
  ]);
  return {
    version: 4, role: user.role, selectedBike: null,
    session: { name: user.name, email: user.email, mode: user.role },
    bikes, components, services, customers, jobs, appointments, shops, connections, shopProfile:profile,
    settings: { shopName: user.shopName || '', notifications: true, distance: 'km' },
  };
}
module.exports = { pool, stmt, transaction, ready, getUser, bootstrap, bikeRows, componentRows, serviceRows, customerRows, jobRows, appointmentRows, shopRows, shopProfile, connectionRows };