// lib/db/schema.ts
import Database from 'better-sqlite3'

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      provider      TEXT PRIMARY KEY,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL
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
}
