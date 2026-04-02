import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { createUser } from '../db/queries/users'
import { createSessionRow } from '../db/queries/sessions'
import {
  hashPassword, verifyPassword, generateSessionToken, requireSession,
} from '../auth/session'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('hashPassword / verifyPassword', () => {
  it('verifyPassword returns true for matching password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
  })

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('secret123')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('hashPassword produces different hashes for same input (salted)', async () => {
    const h1 = await hashPassword('pw')
    const h2 = await hashPassword('pw')
    expect(h1).not.toBe(h2)
  })
})

describe('generateSessionToken', () => {
  it('returns a 64-char hex string', () => {
    const tok = generateSessionToken()
    expect(tok).toHaveLength(64)
    expect(tok).toMatch(/^[0-9a-f]+$/)
  })

  it('returns a unique token each time', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken())
  })
})

describe('requireSession', () => {
  it('returns user for valid token', () => {
    const db = makeDb()
    const uid = createUser(db, 'alice', 'pw')
    createSessionRow(db, 'valid_tok', uid)
    const session = requireSession(db, 'valid_tok')
    expect(session?.userId).toBe(uid)
    expect(session?.username).toBe('alice')
  })

  it('returns null for unknown token', () => {
    expect(requireSession(makeDb(), 'bad_tok')).toBeNull()
  })

  it('returns null for undefined token', () => {
    expect(requireSession(makeDb(), undefined)).toBeNull()
  })
})
