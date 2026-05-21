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
      logo_uri             TEXT,
      business_name        TEXT,
      tax_reg_number       TEXT,
      address              TEXT,
      email                TEXT,
      phone                TEXT,
      web_page             TEXT,
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
      
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='logo_uri') THEN
        ALTER TABLE accounts ADD COLUMN logo_uri TEXT;
        ALTER TABLE accounts ADD COLUMN tax_reg_number TEXT;
        ALTER TABLE accounts ADD COLUMN address TEXT;
        ALTER TABLE accounts ADD COLUMN email TEXT;
        ALTER TABLE accounts ADD COLUMN phone TEXT;
        ALTER TABLE accounts ADD COLUMN web_page TEXT;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='business_name') THEN
        ALTER TABLE accounts ADD COLUMN business_name TEXT;
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
      status                TEXT DEFAULT 'draft' CHECK(status IN ('draft','verified','sent','accepted','declined')),
      summary_explanation   TEXT,
      total_labor_hours     DOUBLE PRECISION DEFAULT 0,
      total_material_cost   DOUBLE PRECISION DEFAULT 0,
      total_equipment_cost  DOUBLE PRECISION DEFAULT 0,
      total_sundry_cost     DOUBLE PRECISION DEFAULT 0,
      total_higher_cost     DOUBLE PRECISION DEFAULT 0,
      tax_amount            DOUBLE PRECISION DEFAULT 0,
      grand_total           DOUBLE PRECISION DEFAULT 0,
      sync_status           TEXT DEFAULT 'synced',
      created_by            TEXT REFERENCES users(user_id),
      verified_by           TEXT REFERENCES users(user_id),
      created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Migration: Add created_by to quotes if it doesn't exist, and migrate existing ones
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='created_by') THEN
        ALTER TABLE quotes ADD COLUMN created_by TEXT REFERENCES users(user_id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quotes' AND column_name='verified_by') THEN
        ALTER TABLE quotes ADD COLUMN verified_by TEXT REFERENCES users(user_id);
      END IF;
    END $$;

    -- Migration: Update status CHECK constraint to allow 'verified'
    DO $$
    DECLARE
      constraint_name text;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid = 'quotes'::regclass AND contype = 'c' AND conname LIKE '%status%';

      IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE quotes DROP CONSTRAINT ' || constraint_name;
      END IF;

      ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK(status IN ('draft', 'verified', 'sent', 'accepted', 'declined'));
    END $$;

    UPDATE quotes q 
    SET created_by = (SELECT user_id FROM users u WHERE u.account_id = q.account_id LIMIT 1)
    WHERE q.created_by IS NULL;


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
