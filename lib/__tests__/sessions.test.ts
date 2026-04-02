import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { createUser } from '../db/queries/users'
import {
  createSessionRow, getSessionByToken, deleteSessionRow, touchSession, type SessionRow,
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

  it('touchSession updates last_seen_at', () => {
    const db = makeDb()
    const uid = createUser(db, 'carol', 'pw')
    createSessionRow(db, 'tok_touch', uid)
    const before = (getSessionByToken(db, 'tok_touch') as SessionRow).last_seen_at
    // Advance mocked time by 2 seconds so floor(ms/1000) is strictly greater
    const future = (before + 2) * 1000
    jest.spyOn(Date, 'now').mockReturnValue(future)
    touchSession(db, 'tok_touch')
    jest.restoreAllMocks()
    const after = (getSessionByToken(db, 'tok_touch') as SessionRow).last_seen_at
    expect(after).toBeGreaterThan(before)
  })

  it('session is deleted when user is deleted (CASCADE)', () => {
    const db = makeDb()
    const uid = createUser(db, 'dave', 'pw')
    createSessionRow(db, 'tok_cascade', uid)
    db.prepare('DELETE FROM users WHERE id = ?').run(uid)
    expect(getSessionByToken(db, 'tok_cascade')).toBeNull()
  })
})
