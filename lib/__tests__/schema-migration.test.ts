import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { getToken, saveToken } from '../db/queries/tokens'
import { getConfig, setConfig } from '../db/queries/config'

function createUser(db: Database.Database, username: string, password: string): number {
  db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)').run(username, password, Math.floor(Date.now() / 1000))
  return (db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number }).id
}

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
    const pkCols = (db.prepare("PRAGMA table_info(config)").all() as { name: string; pk: number }[])
      .filter(c => c.pk > 0)
      .map(c => c.name)
    expect(pkCols).toEqual(expect.arrayContaining(['user_id', 'key']))
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
    const pkCols = (db.prepare("PRAGMA table_info(tokens)").all() as { name: string; pk: number }[])
      .filter(c => c.pk > 0)
      .map(c => c.name)
    expect(pkCols).toEqual(expect.arrayContaining(['user_id', 'provider']))
  })

  it('tokens table has email column after migration', () => {
    const db = makeDb()
    const cols = db.prepare("PRAGMA table_info(tokens)").all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('email')
  })

  it('tokens table has email in primary key after migration', () => {
    const db = makeDb()
    const pkCols = (db.prepare("PRAGMA table_info(tokens)").all() as { name: string; pk: number }[])
      .filter(c => c.pk > 0)
      .map(c => c.name)
    expect(pkCols).toContain('email')
  })

  it('existing tokens get email = \'\' during migration', () => {
    const db = new Database(':memory:')
    // Simulate pre-existing tokens table without email
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE tokens (
        user_id  INTEGER,
        provider TEXT NOT NULL,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, provider)
      );
      INSERT INTO tokens VALUES (NULL, 'monzo', 'at1', 'rt1', 9999999999);
    `)
    createSchema(db)
    const row = db.prepare("SELECT email FROM tokens WHERE provider = 'monzo'").get() as { email: string }
    expect(row.email).toBe('')
  })

  it('getToken and saveToken scope correctly to user_id', () => {
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

describe('config queries with user_id scoping', () => {
  it('setConfig/getConfig with no userId writes global row', () => {
    const db = makeDb()
    setConfig(db, 'monzo_client_id', 'cid')
    expect(getConfig(db, 'monzo_client_id')).toBe('cid')
  })

  it('setConfig/getConfig with userId writes per-user row', () => {
    const db = makeDb()
    const uid = createUser(db, 'alice', 'pw')
    setConfig(db, 'lookback_days', '30', uid)
    expect(getConfig(db, 'lookback_days', uid)).toBe('30')
    // Global read should not see it
    expect(getConfig(db, 'lookback_days')).toBeNull()
  })

  it('per-user config does not bleed across users', () => {
    const db = makeDb()
    const uid1 = createUser(db, 'alice', 'pw')
    const uid2 = createUser(db, 'bob', 'pw')
    setConfig(db, 'lookback_days', '7', uid1)
    setConfig(db, 'lookback_days', '30', uid2)
    expect(getConfig(db, 'lookback_days', uid1)).toBe('7')
    expect(getConfig(db, 'lookback_days', uid2)).toBe('30')
  })
})
