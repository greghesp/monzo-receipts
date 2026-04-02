// lib/db/__tests__/schema.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'

describe('createSchema', () => {
  it('creates all four tables', () => {
    const db = new Database(':memory:')
    createSchema(db)
    const tables = (db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as { name: string }[]).map(r => r.name)
    expect(tables).toEqual(['config', 'matches', 'runs', 'sessions', 'tokens', 'users'])
  })

  it('is idempotent', () => {
    const db = new Database(':memory:')
    expect(() => { createSchema(db); createSchema(db) }).not.toThrow()
  })
})
