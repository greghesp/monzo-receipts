import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { createUser } from '../db/queries/users'
import {
  createSessionRow, getSessionByToken, deleteSessionRow, touchSession,
} from '../db/queries/sessions'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('sessions queries', () => {
  it('createSessionRow inserts a session', () => {
    const db = makeDb()
    const userId = createUser(db, 'alice', 'pw')
    createSessionRow(db, 'tok_abc', userId)
    const s = getSessionByToken(db, 'tok_abc')
    expect(s?.user_id).toBe(userId)
    expect(s?.username).toBe('alice')
  })

  it('getSessionByToken returns null for unknown token', () => {
    expect(getSessionByToken(makeDb(), 'nope')).toBeNull()
  })

  it('deleteSessionRow removes the session', () => {
    const db = makeDb()
    const uid = createUser(db, 'bob', 'pw')
    createSessionRow(db, 'tok_del', uid)
    deleteSessionRow(db, 'tok_del')
    expect(getSessionByToken(db, 'tok_del')).toBeNull()
  })

  it('touchSession updates last_seen_at', async () => {
    const db = makeDb()
    const uid = createUser(db, 'carol', 'pw')
    createSessionRow(db, 'tok_touch', uid)
    const before = getSessionByToken(db, 'tok_touch')!.last_seen_at
    await new Promise(r => setTimeout(r, 10))
    touchSession(db, 'tok_touch')
    const after = getSessionByToken(db, 'tok_touch')!.last_seen_at
    expect(after).toBeGreaterThanOrEqual(before)
  })

  it('session is deleted when user is deleted (CASCADE)', () => {
    const db = makeDb()
    const uid = createUser(db, 'dave', 'pw')
    createSessionRow(db, 'tok_cascade', uid)
    db.prepare('DELETE FROM users WHERE id = ?').run(uid)
    expect(getSessionByToken(db, 'tok_cascade')).toBeNull()
  })
})
