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
const componentRows = id => stmt('SELECT id,bike_id AS "bikeId",name,icon,interval,last_km AS "lastKm",next_km AS "nextKm",due_date AS "dueDate",interval_days AS "intervalDays",last_service_date AS "lastServiceDate",source,notes,archived_at IS NOT NULL AS archived FROM components WHERE user_id=? ORDER BY row_seq').all(id);
const serviceRows = id => stmt('SELECT id,bike_id AS "bikeId",component_id AS "componentId",type,date,mileage,cost,shop,notes FROM services WHERE user_id=? ORDER BY date DESC,row_seq DESC').all(id);
const customerRows = id => stmt('SELECT id,name,contact,motorcycle,odometer,last_visit AS "lastVisit" FROM customers WHERE user_id=? ORDER BY row_seq DESC').all(id);
const jobRows = id => stmt('SELECT id,customer_id AS "customerId",service,date,status,cost FROM jobs WHERE user_id=? ORDER BY date DESC,row_seq DESC').all(id);
const appointmentRows = id => stmt('SELECT id,customer_id AS "customerId",service,date,time,status FROM appointments WHERE user_id=? ORDER BY date,time').all(id);
// Only the requesting rider and the target shop may see the request. No service history, contact details or odometer is shared.
const riderAppointmentRows = user => stmt('SELECT a.id,a.rider_id AS "riderId",a.shop_id AS "shopId",a.bike_id AS "bikeId",a.bike_model AS "bikeModel",a.service,a.date,a.time,a.notes,a.status,a.review_note AS "reviewNote",a.reviewed_at AS "reviewedAt",a.created_at AS "createdAt",s.shop_name AS "shopName",r.name AS "riderName" FROM rider_appointment_requests a JOIN users s ON s.id=a.shop_id JOIN users r ON r.id=a.rider_id WHERE '+(user.role==='rider'?'a.rider_id=?':'a.shop_id=?')+' ORDER BY a.date DESC,a.time DESC,a.created_at DESC LIMIT 300').all(user.id);
const shopRows = ({query='',city='',service=''}={}) => stmt(`SELECT id,shop_name AS "shopName",shop_city AS city,shop_address AS address,shop_description AS description,services_offered AS services FROM users
 WHERE role=?
 AND (?='' OR shop_name ILIKE '%'||?||'%' OR shop_city ILIKE '%'||?||'%' OR shop_description ILIKE '%'||?||'%' OR shop_address ILIKE '%'||?||'%')
 AND (?='' OR shop_city ILIKE '%'||?||'%')
 AND (?='' OR ?=ANY(services_offered))
 ORDER BY CASE WHEN shop_city='' THEN 1 ELSE 0 END,shop_name,id LIMIT 100`).all('shop',query,query,query,query,query,city,city,service,service);
const shopProfile = id => stmt('SELECT shop_city AS city,shop_address AS address,shop_description AS description,services_offered AS services FROM users WHERE id=? AND role=?').get(id,'shop');
// Only account names and status are exposed. No email, bikes, services or customer records.
const connectionRows = user => stmt('SELECT c.id,c.rider_id AS "riderId",c.shop_id AS "shopId",c.status,c.created_at AS "createdAt",s.shop_name AS "shopName",r.name AS "riderName" FROM account_connections c JOIN users s ON s.id=c.shop_id AND s.role=? JOIN users r ON r.id=c.rider_id AND r.role=? WHERE '+(user.role==='rider'?'c.rider_id=?':'c.shop_id=?')+' ORDER BY c.created_at DESC,c.id DESC').all('shop','rider',user.id);
// These queries expose only the specific submitted report or explicitly shared service entry.
const serviceReportRows = user => stmt('SELECT sr.id,sr.appointment_id AS "appointmentId",sr.rider_id AS "riderId",sr.shop_id AS "shopId",sr.bike_id AS "bikeId",sr.bike_model AS "bikeModel",sr.service,sr.service_date AS "serviceDate",sr.cost,sr.notes,sr.status,sr.imported_service_id AS "importedServiceId",sr.created_at AS "createdAt",sr.reviewed_at AS "reviewedAt",u.name AS "riderName",sp.shop_name AS "shopName" FROM shop_service_reports sr JOIN users u ON u.id=sr.rider_id JOIN users sp ON sp.id=sr.shop_id WHERE '+(user.role==='rider'?'sr.rider_id=?':'sr.shop_id=?')+' ORDER BY sr.created_at DESC LIMIT 300').all(user.id);
const serviceShareRows = user => stmt('SELECT sh.id,sh.rider_id AS "riderId",sh.shop_id AS "shopId",sh.service_id AS "serviceId",sh.created_at AS "createdAt",sv.type,sv.date,sv.cost,sv.shop,sv.notes,b.model AS "bikeModel",r.name AS "riderName",sp.shop_name AS "shopName" FROM rider_service_shares sh JOIN services sv ON sv.id=sh.service_id AND sv.user_id=sh.rider_id JOIN bikes b ON b.id=sv.bike_id JOIN users r ON r.id=sh.rider_id JOIN users sp ON sp.id=sh.shop_id JOIN account_connections c ON c.rider_id=sh.rider_id AND c.shop_id=sh.shop_id AND c.status=? WHERE '+(user.role==='rider'?'sh.rider_id=?':'sh.shop_id=?')+' ORDER BY sh.created_at DESC LIMIT 300').all('accepted',user.id);
// Only the recipient can retrieve their own notification feed.
const notificationRows = id => stmt('SELECT id,type,message,route,created_at AS "createdAt",read_at AS "readAt" FROM account_notifications WHERE recipient_id=? ORDER BY created_at DESC,id DESC LIMIT 80').all(id);
const notificationUnreadCount = id => stmt('SELECT COUNT(*)::int AS count FROM account_notifications WHERE recipient_id=? AND read_at IS NULL').get(id);
async function bootstrap(user) {
  const rider = user.role === 'rider';
  const [bikes, components, services, customers, jobs, appointments, shops, connections, profile, riderAppointments, serviceReports, serviceShares, notificationInbox, unreadRow] = await Promise.all([
    rider ? bikeRows(user.id) : [],
    rider ? componentRows(user.id) : [],
    rider ? serviceRows(user.id) : [],
    !rider ? customerRows(user.id) : [],
    !rider ? jobRows(user.id) : [],
    !rider ? appointmentRows(user.id) : [],
    rider ? shopRows() : [],
    connectionRows(user),
    rider ? null : shopProfile(user.id),
    riderAppointmentRows(user),
    serviceReportRows(user),
    serviceShareRows(user),
    notificationRows(user.id),
    notificationUnreadCount(user.id),
  ]);
  return {
    version: 4, role: user.role, selectedBike: null,
    session: { name: user.name, email: user.email, mode: user.role },
    bikes, components, services, customers, jobs, appointments, shops, connections, shopProfile:profile, riderAppointments, serviceReports, serviceShares, notificationInbox, notificationUnreadCount:unreadRow.count,
    settings: { shopName: user.shopName || '', notifications: true, distance: 'km' },
  };
}
module.exports = { pool, stmt, transaction, ready, getUser, bootstrap, bikeRows, componentRows, serviceRows, customerRows, jobRows, appointmentRows, shopRows, shopProfile, connectionRows, riderAppointmentRows, serviceReportRows, serviceShareRows, notificationRows, notificationUnreadCount };