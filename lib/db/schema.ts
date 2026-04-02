// lib/db/schema.ts
import Database from 'better-sqlite3'

export function createSchema(db: Database.Database): void {
  // ── Core tables ──────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token        TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at             INTEGER NOT NULL,
      completed_at           INTEGER,
      status                 TEXT NOT NULL DEFAULT 'running',
      cursor_transaction_id  TEXT,
      transactions_scanned   INTEGER NOT NULL DEFAULT 0,
      matched                INTEGER NOT NULL DEFAULT 0,
      needs_review           INTEGER NOT NULL DEFAULT 0,
      no_match               INTEGER NOT NULL DEFAULT 0,
      error_message          TEXT
    );

    CREATE TABLE IF NOT EXISTS matches (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id   TEXT UNIQUE NOT NULL,
      external_id      TEXT UNIQUE,
      merchant         TEXT NOT NULL,
      amount           INTEGER NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'GBP',
      status           TEXT NOT NULL,
      confidence       TEXT,
      receipt_data     TEXT,
      matched_at       INTEGER NOT NULL
    );
  `)

  // ── Idempotent column additions (matches table) ───────────────────────────
  const tryAlter = (sql: string) => { try { db.exec(sql) } catch { /* already exists */ } }

  tryAlter('ALTER TABLE matches ADD COLUMN transaction_date TEXT')
  tryAlter('ALTER TABLE matches ADD COLUMN merchant_online INTEGER NOT NULL DEFAULT 0')
  tryAlter('ALTER TABLE matches ADD COLUMN account_id TEXT')
  tryAlter('ALTER TABLE runs ADD COLUMN user_id INTEGER REFERENCES users(id)')

  // ── Table-rebuild migrations for tokens and config ───────────────────────
  // SQLite cannot change PRIMARY KEY via ALTER TABLE, so we use the
  // create-new / copy / drop-old / rename pattern. Both migrations are
  // idempotent: they check whether the user_id column already exists first.

  const tokensHasUserId = (db.prepare("PRAGMA table_info(tokens)").all() as { name: string }[])
    .some(c => c.name === 'user_id')

  if (!tokensHasUserId) {
    // tokens table may not exist yet on a fresh install
    db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        provider      TEXT PRIMARY KEY,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE TABLE tokens_new (
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider      TEXT NOT NULL,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, provider)
      );
      INSERT INTO tokens_new SELECT NULL, provider, access_token, refresh_token, expires_at FROM tokens;
      DROP TABLE tokens;
      ALTER TABLE tokens_new RENAME TO tokens;
    `)
  } else {
    // user_id column already exists (post-migration or fresh install) — just ensure table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
        provider      TEXT NOT NULL,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, provider)
      );
    `)
  }

  const configHasUserId = (db.prepare("PRAGMA table_info(config)").all() as { name: string }[])
    .some(c => c.name === 'user_id')

  if (!configHasUserId) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE config_new (
        user_id INTEGER,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
      INSERT INTO config_new SELECT NULL, key, value FROM config;
      DROP TABLE config;
      ALTER TABLE config_new RENAME TO config;
    `)
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        user_id INTEGER,
        key     TEXT NOT NULL,
        value   TEXT NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `)
  }
}
