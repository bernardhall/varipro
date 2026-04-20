const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/varipro.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id           TEXT PRIMARY KEY,
      account_number       TEXT UNIQUE NOT NULL,
      account_name         TEXT NOT NULL,
      default_hourly_rate  REAL DEFAULT 75,
      tax_rate             REAL DEFAULT 0,
      created_at           TEXT DEFAULT (datetime('now'))
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
      face_recognition_enabled INTEGER DEFAULT 0,
      face_recognition_token  TEXT,
      is_admin                INTEGER DEFAULT 0,
      last_login              TEXT,
      created_at              TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id    TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL REFERENCES users(user_id),
      refresh_token TEXT NOT NULL,
      expires_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id           TEXT PRIMARY KEY,
      account_id   TEXT NOT NULL REFERENCES accounts(account_id),
      full_name    TEXT NOT NULL,
      email        TEXT,
      phone        TEXT,
      site_address TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id                    TEXT PRIMARY KEY,
      account_id            TEXT NOT NULL REFERENCES accounts(account_id),
      client_id             TEXT REFERENCES clients(id),
      job_name              TEXT NOT NULL,
      status                TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','declined')),
      summary_explanation   TEXT,
      total_labor_hours     REAL DEFAULT 0,
      total_material_cost   REAL DEFAULT 0,
      total_equipment_cost  REAL DEFAULT 0,
      total_sundry_cost     REAL DEFAULT 0,
      total_higher_cost     REAL DEFAULT 0,
      tax_amount            REAL DEFAULT 0,
      grand_total           REAL DEFAULT 0,
      sync_status           TEXT DEFAULT 'synced',
      created_at            TEXT DEFAULT (datetime('now')),
      updated_at            TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quote_tasks (
      id              TEXT PRIMARY KEY,
      quote_id        TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      task_name       TEXT NOT NULL,
      task_type       TEXT DEFAULT 'hourly' CHECK(task_type IN ('hourly', 'set')),
      estimated_hours REAL DEFAULT 0,
      hourly_rate     REAL DEFAULT 0,
      price           REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_materials (
      id         TEXT PRIMARY KEY,
      quote_id   TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      item_name  TEXT NOT NULL,
      quantity   REAL DEFAULT 1,
      unit_cost  REAL DEFAULT 0,
      total      REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_equipment (
      id            TEXT PRIMARY KEY,
      quote_id      TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      item_name     TEXT NOT NULL,
      duration_days REAL DEFAULT 1,
      daily_rate    REAL DEFAULT 0,
      total         REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_sundry (
      id          TEXT PRIMARY KEY,
      quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      flat_amount REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_higher_costs (
      id          TEXT PRIMARY KEY,
      quote_id    TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount      REAL DEFAULT 0
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

module.exports = { getDb };
