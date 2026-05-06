const { Pool } = require('pg');

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

// Only add SSL if we have a connection string (prevents local crashes)
if (process.env.DATABASE_URL) {
  poolConfig.ssl = { rejectUnauthorized: false };
} else {
  console.warn('⚠️ WARNING: DATABASE_URL not found. Connection may fail.');
}

const pool = new Pool(poolConfig);

async function query(text, params) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not defined.');
  }
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('executed query', { text, duration, rows: res.rowCount });
  return res;
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id           TEXT PRIMARY KEY,
      account_number       TEXT UNIQUE NOT NULL,
      account_name         TEXT NOT NULL,
      default_hourly_rate  DOUBLE PRECISION DEFAULT 75,
      tax_rate             DOUBLE PRECISION DEFAULT 0,
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id                 TEXT PRIMARY KEY,
      account_id              TEXT NOT NULL REFERENCES accounts(account_id),
      first_name              TEXT NOT NULL,
      last_name               TEXT NOT NULL,
      login_name              TEXT UNIQUE NOT NULL,
      email                   TEXT NOT NULL,
      password_hash           TEXT NOT NULL,
      pin_hash                TEXT,
      is_admin                INTEGER DEFAULT 0,
      is_confirmed            INTEGER DEFAULT 0,
      confirmation_token      TEXT,
      confirmation_expires    TIMESTAMP,
      last_login              TIMESTAMP,
      created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Migration: Add missing columns if they don't exist
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pin_hash') THEN
        ALTER TABLE users ADD COLUMN pin_hash TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_confirmed') THEN
        ALTER TABLE users ADD COLUMN is_confirmed INTEGER DEFAULT 0;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='confirmation_token') THEN
        ALTER TABLE users ADD COLUMN confirmation_token TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='confirmation_expires') THEN
        ALTER TABLE users ADD COLUMN confirmation_expires TIMESTAMP;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id    TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(user_id),
      refresh_token TEXT NOT NULL,
      expires_at    TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id           TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL REFERENCES accounts(account_id),
      full_name    TEXT NOT NULL,
      email        TEXT,
      phone        TEXT,
      site_address TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id                    TEXT PRIMARY KEY,
      account_id            TEXT NOT NULL REFERENCES accounts(account_id),
      client_id             TEXT REFERENCES clients(id),
      job_name              TEXT NOT NULL,
      status                TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','declined')),
      summary_explanation   TEXT,
      total_labor_hours     DOUBLE PRECISION DEFAULT 0,
      total_material_cost   DOUBLE PRECISION DEFAULT 0,
      total_equipment_cost  DOUBLE PRECISION DEFAULT 0,
      total_sundry_cost     DOUBLE PRECISION DEFAULT 0,
      total_higher_cost     DOUBLE PRECISION DEFAULT 0,
      tax_amount            DOUBLE PRECISION DEFAULT 0,
      grand_total           DOUBLE PRECISION DEFAULT 0,
      sync_status           TEXT DEFAULT 'synced',
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quote_tasks (
      id              TEXT PRIMARY KEY,
      quote_id        TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      task_name       TEXT NOT NULL,
      task_type       TEXT DEFAULT 'hourly' CHECK(task_type IN ('hourly', 'set', 'charge')),
      estimated_hours DOUBLE PRECISION DEFAULT 0,
      hourly_rate     DOUBLE PRECISION DEFAULT 0,
      price           DOUBLE PRECISION DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_materials (
      id         TEXT PRIMARY KEY,
      quote_id   TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      item_name  TEXT NOT NULL,
      quantity   DOUBLE PRECISION DEFAULT 1,
      unit_cost  DOUBLE PRECISION DEFAULT 0,
      total      DOUBLE PRECISION DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_equipment (
      id            TEXT PRIMARY KEY,
      quote_id      TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      item_name     TEXT NOT NULL,
      duration_days DOUBLE PRECISION DEFAULT 1,
      daily_rate    DOUBLE PRECISION DEFAULT 0,
      total         DOUBLE PRECISION DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_sundry (
      id          TEXT PRIMARY KEY,
      quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      flat_amount DOUBLE PRECISION DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_higher_costs (
      id          TEXT PRIMARY KEY,
      quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount      DOUBLE PRECISION DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_photos (
      id          TEXT PRIMARY KEY,
      quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      image_uri   TEXT NOT NULL,
      caption     TEXT,
      sort_order  INTEGER DEFAULT 0,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_account_status ON quotes(account_id, status);
    CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
    CREATE INDEX IF NOT EXISTS idx_users_login ON users(login_name);
    CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);
  `);
}

module.exports = { query, initSchema, pool };
