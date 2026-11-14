-- MotoKare Phase 3 — PostgreSQL schema (created automatically on startup).
-- Dates are canonical YYYY-MM-DD text to preserve the existing API contract.
-- Every resource belongs to an account; service/job/appointment relationships cascade.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rider', 'shop')),
  shop_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);
CREATE TABLE IF NOT EXISTS bikes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  plate TEXT NOT NULL DEFAULT '',
  odometer INTEGER NOT NULL CHECK (odometer >= 0),
  updated TEXT NOT NULL,
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS bikes_user ON bikes(user_id);
CREATE TABLE IF NOT EXISTS components (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  interval INTEGER NOT NULL CHECK (interval > 0),
  last_km INTEGER NOT NULL CHECK (last_km >= 0),
  next_km INTEGER NOT NULL CHECK (next_km >= 0),
  due_date TEXT NOT NULL,
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS components_user_bike ON components (user_id, bike_id);
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bike_id TEXT NOT NULL REFERENCES bikes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  date TEXT NOT NULL,
  mileage INTEGER NOT NULL CHECK (mileage >= 0),
  cost DOUBLE PRECISION NOT NULL CHECK (cost >= 0),
  shop TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS services_user_bike ON services(user_id,bike_id);
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  motorcycle TEXT NOT NULL,
  odometer INTEGER NOT NULL CHECK (odometer >= 0),
  last_visit TEXT NOT NULL,
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS customers_user ON customers(user_id);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending','In Progress','Completed')),
  cost DOUBLE PRECISION NOT NULL CHECK (cost >= 0),
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Pending','Confirmed','Completed','Cancelled')),
  row_seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX IF NOT EXISTS appointments_user ON appointments(user_id);
-- Safe additive upgrade: preserve historical data and existing due dates.
ALTER TABLE components ADD COLUMN IF NOT EXISTS interval_days INTEGER;
ALTER TABLE components ADD COLUMN IF NOT EXISTS last_service_date TEXT;
UPDATE components SET interval_days = CASE name
  WHEN 'Engine Oil' THEN 30
  WHEN 'Brake Inspection' THEN 60
  WHEN 'Air Filter' THEN 90
  WHEN 'Chain & Sprocket' THEN 45
  WHEN 'Battery Check' THEN 120
  WHEN 'Tire Inspection' THEN 60
  ELSE 90 END
WHERE interval_days IS NULL;

-- Phase 4.1: opt-in rider/workshop connections. No service records are shared.
CREATE TABLE IF NOT EXISTS account_connections (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id,shop_id),
  CHECK (rider_id <> shop_id)
);
CREATE INDEX IF NOT EXISTS connections_rider ON account_connections(rider_id,status);
CREATE INDEX IF NOT EXISTS connections_shop ON account_connections(shop_id,status);

-- Phase 4.2: optional public workshop discovery profile (not verified by MotoKare).
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_city TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_address TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_description TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS services_offered TEXT[] NOT NULL DEFAULT '{}';

-- Components upgrade: safe additive migration, no deletion or replacement of existing riders' data.
ALTER TABLE components ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'default';
ALTER TABLE components ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE components ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
-- Keep service history even when a component is permanently deleted.
ALTER TABLE services ADD COLUMN IF NOT EXISTS component_id TEXT REFERENCES components(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS services_component ON services(component_id);
-- Prevent duplicate active components within the same motorcycle, regardless of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS components_unique_active_name ON components(bike_id,LOWER(name)) WHERE archived_at IS NULL;

-- Phase 4.3: opt-in rider-created workshop appointment requests.
-- Separate from legacy appointments, which require manual workshop customer records.
CREATE TABLE IF NOT EXISTS rider_appointment_requests (
 id TEXT PRIMARY KEY,
 rider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shop_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bike_id TEXT REFERENCES bikes(id) ON DELETE SET NULL,
 bike_model TEXT NOT NULL,
 service TEXT NOT NULL,
 date TEXT NOT NULL,
 time TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Confirmed','Declined','Completed','Cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rider_requests_rider ON rider_appointment_requests(rider_id,date,time);
CREATE INDEX IF NOT EXISTS rider_requests_shop ON rider_appointment_requests(shop_id,status,date,time);
-- Idempotent double-submit protection (not a claim of workshop availability).
CREATE UNIQUE INDEX IF NOT EXISTS rider_requests_unique_active_slot ON rider_appointment_requests(rider_id,shop_id,date,time) WHERE status IN ('Pending','Confirmed');

-- Phase 4.4: shop-reviewed rider appointment requests (additive and reversible).
ALTER TABLE rider_appointment_requests ADD COLUMN IF NOT EXISTS review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE rider_appointment_requests ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
-- Prevent two riders receiving a confirmation for the same workshop/time.
-- Other statuses are intentionally unrestricted, including Pending requests.
CREATE UNIQUE INDEX IF NOT EXISTS rider_requests_unique_confirmed_slot ON rider_appointment_requests(shop_id,date,time) WHERE status='Confirmed';

-- Phase 4.5: workshop-created service reports are explicitly accepted or declined by riders.
-- Acceptance creates a rider-owned history entry; no existing services are shared automatically.
CREATE TABLE IF NOT EXISTS shop_service_reports (
 id TEXT PRIMARY KEY,
 appointment_id TEXT NOT NULL UNIQUE REFERENCES rider_appointment_requests(id) ON DELETE CASCADE,
 rider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shop_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 bike_id TEXT REFERENCES bikes(id) ON DELETE SET NULL,
 bike_model TEXT NOT NULL,
 service TEXT NOT NULL,
 service_date TEXT NOT NULL,
 cost DOUBLE PRECISION NOT NULL CHECK (cost>=0),
 notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Accepted','Declined')),
 imported_service_id TEXT UNIQUE REFERENCES services(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shop_service_reports_rider ON shop_service_reports(rider_id,status,created_at);
CREATE INDEX IF NOT EXISTS shop_service_reports_shop ON shop_service_reports(shop_id,created_at);
-- Riders share individual history entries only with workshops whose connection is accepted.
CREATE TABLE IF NOT EXISTS rider_service_shares (
 id TEXT PRIMARY KEY,
 rider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 shop_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(rider_id,shop_id,service_id)
);
CREATE INDEX IF NOT EXISTS rider_service_shares_shop ON rider_service_shares(shop_id,created_at);

-- Phase 4.6: private, persistent in-app activity notifications.
CREATE TABLE IF NOT EXISTS account_notifications (
 id TEXT PRIMARY KEY,
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 type TEXT NOT NULL,
 message TEXT NOT NULL,
 route TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_inbox_latest ON account_notifications(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_inbox_unread ON account_notifications(recipient_id,created_at DESC) WHERE read_at IS NULL;
