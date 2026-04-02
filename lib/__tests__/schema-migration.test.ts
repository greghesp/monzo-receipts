import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'

const makeDb = () => {
  const db = new Database(':memory:')
  createSchema(db)
  return db
}

describe('schema migration', () => {
  it('creates users table', () => {
    const db = makeDb()
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
    expect(row).toBeTruthy()
  })

  it('creates sessions table', () => {
    const db = makeDb()
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get()
    expect(row).toBeTruthy()
  })

  it('tokens table has user_id column', () => {
    const db = makeDb()
    const cols = db.prepare("PRAGMA table_info(tokens)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('user_id')
  })

  it('config table has user_id column', () => {
    const db = makeDb()
    const cols = db.prepare("PRAGMA table_info(config)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('user_id')
  })

  it('runs table has user_id column', () => {
    const db = makeDb()
    const cols = db.prepare("PRAGMA table_info(runs)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('user_id')
  })

  it('is idempotent — running createSchema twice does not throw', () => {
    const db = makeDb()
    expect(() => createSchema(db)).not.toThrow()
  })

  it('preserves existing config rows after migration (user_id = NULL)', () => {
    // Simulate a pre-existing installation: create old schema first
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO config VALUES ('monzo_client_id', 'cid_test');
    `)
    createSchema(db)
    const row = db.prepare("SELECT * FROM config WHERE key = 'monzo_client_id'").get() as { key: string; value: string; user_id: number | null }
    expect(row.value).toBe('cid_test')
    expect(row.user_id).toBeNull()
  })

  it('preserves existing tokens rows after migration (user_id = NULL)', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE tokens (
        provider      TEXT PRIMARY KEY,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      INSERT INTO tokens VALUES ('monzo', 'acc_test', 'ref_test', 9999999999);
    `)
    createSchema(db)
    const row = db.prepare("SELECT * FROM tokens WHERE provider = 'monzo'").get() as { provider: string; access_token: string; user_id: number | null }
    expect(row.access_token).toBe('acc_test')
    expect(row.user_id).toBeNull()
  })

  it('getToken and saveToken scope correctly to user_id', () => {
    const { getToken, saveToken } = require('../db/queries/tokens')
    const db = makeDb()
    const tokenA = { provider: 'monzo' as const, access_token: 'acc_a', refresh_token: 'ref_a', expires_at: 9999999999 }
    const tokenB = { provider: 'monzo' as const, access_token: 'acc_b', refresh_token: 'ref_b', expires_at: 9999999999 }
    // Insert users so FK constraint is satisfied
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run('user1', 'hash1', 1)
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run('user2', 'hash2', 1)
    const user1Id = (db.prepare("SELECT id FROM users WHERE username = 'user1'").get() as { id: number }).id
    const user2Id = (db.prepare("SELECT id FROM users WHERE username = 'user2'").get() as { id: number }).id
    saveToken(db, tokenA, user1Id)
    saveToken(db, tokenB, user2Id)
    expect(getToken(db, 'monzo', user1Id)?.access_token).toBe('acc_a')
    expect(getToken(db, 'monzo', user2Id)?.access_token).toBe('acc_b')
    expect(getToken(db, 'monzo', null)).toBeNull()
  })
})
