// lib/db/__tests__/tokens.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { getToken, getTokens, saveToken, deleteToken, isTokenExpiredOrExpiringSoon } from '../queries/tokens'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const future = () => Math.floor(Date.now() / 1000) + 7200

const monzoToken = (at = 'at') => ({ provider: 'monzo' as const, email: '', access_token: at, refresh_token: 'rt', expires_at: future() })
const googleToken = (email: string, at = 'at') => ({ provider: 'google' as const, email, access_token: at, refresh_token: 'rt', expires_at: future() })

describe('token queries — single (monzo-style)', () => {
  it('returns null when no token', () => expect(getToken(makeDb(), 'monzo')).toBeNull())

  it('saves and retrieves', () => {
    const db = makeDb()
    saveToken(db, monzoToken(), null)
    expect(getToken(db, 'monzo')?.access_token).toBe('at')
  })

  it('overwrites on re-save', () => {
    const db = makeDb()
    saveToken(db, monzoToken('old'), null)
    saveToken(db, monzoToken('new'), null)
    expect(getToken(db, 'monzo')?.access_token).toBe('new')
  })

  it('deletes a token', () => {
    const db = makeDb()
    saveToken(db, monzoToken(), null)
    deleteToken(db, 'monzo')
    expect(getToken(db, 'monzo')).toBeNull()
  })
})

describe('token queries — multiple (google-style)', () => {
  it('getTokens returns empty array when none', () => {
    expect(getTokens(makeDb(), 'google')).toEqual([])
  })

  it('saves two google accounts and getTokens returns both', () => {
    const db = makeDb()
    saveToken(db, googleToken('a@gmail.com', 'at_a'), null)
    saveToken(db, googleToken('b@gmail.com', 'at_b'), null)
    const tokens = getTokens(db, 'google', null)
    expect(tokens).toHaveLength(2)
    const emails = tokens.map(t => t.email).sort()
    expect(emails).toEqual(['a@gmail.com', 'b@gmail.com'])
  })

  it('getToken fetches by email', () => {
    const db = makeDb()
    saveToken(db, googleToken('a@gmail.com', 'at_a'), null)
    saveToken(db, googleToken('b@gmail.com', 'at_b'), null)
    expect(getToken(db, 'google', null, 'a@gmail.com')?.access_token).toBe('at_a')
    expect(getToken(db, 'google', null, 'b@gmail.com')?.access_token).toBe('at_b')
  })

  it('overwrites token for same email', () => {
    const db = makeDb()
    saveToken(db, googleToken('a@gmail.com', 'old'), null)
    saveToken(db, googleToken('a@gmail.com', 'new'), null)
    expect(getTokens(db, 'google', null)).toHaveLength(1)
    expect(getToken(db, 'google', null, 'a@gmail.com')?.access_token).toBe('new')
  })

  it('deleteToken removes only the specified email', () => {
    const db = makeDb()
    saveToken(db, googleToken('a@gmail.com'), null)
    saveToken(db, googleToken('b@gmail.com'), null)
    deleteToken(db, 'google', null, 'a@gmail.com')
    const tokens = getTokens(db, 'google', null)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].email).toBe('b@gmail.com')
  })

  it('tokens are scoped by user_id', () => {
    const db = makeDb()
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run('u1', 'h', 1)
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run('u2', 'h', 1)
    const u1 = (db.prepare("SELECT id FROM users WHERE username='u1'").get() as { id: number }).id
    const u2 = (db.prepare("SELECT id FROM users WHERE username='u2'").get() as { id: number }).id
    saveToken(db, googleToken('shared@gmail.com', 'u1_token'), u1)
    saveToken(db, googleToken('shared@gmail.com', 'u2_token'), u2)
    expect(getToken(db, 'google', u1, 'shared@gmail.com')?.access_token).toBe('u1_token')
    expect(getToken(db, 'google', u2, 'shared@gmail.com')?.access_token).toBe('u2_token')
  })
})

describe('isTokenExpiredOrExpiringSoon', () => {
  it('detects near-expiry', () => {
    const t = { provider: 'monzo' as const, email: '', access_token: 'at', refresh_token: 'rt', expires_at: Math.floor(Date.now() / 1000) + 60 }
    expect(isTokenExpiredOrExpiringSoon(t)).toBe(true)
  })
  it('not near-expiry for far future', () => {
    const t = { provider: 'monzo' as const, email: '', access_token: 'at', refresh_token: 'rt', expires_at: future() }
    expect(isTokenExpiredOrExpiringSoon(t)).toBe(false)
  })
})
