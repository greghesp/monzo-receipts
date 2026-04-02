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
})
