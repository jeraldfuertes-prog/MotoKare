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
