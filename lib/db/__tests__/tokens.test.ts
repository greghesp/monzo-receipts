// lib/db/__tests__/tokens.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { getToken, saveToken, deleteToken, isTokenExpiredOrExpiringSoon } from '../queries/tokens'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const future = () => Math.floor(Date.now() / 1000) + 7200

describe('token queries', () => {
  it('returns null when no token', () => expect(getToken(makeDb(), 'monzo')).toBeNull())
  it('saves and retrieves', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'at', refresh_token: 'rt', expires_at: future() })
    expect(getToken(db, 'monzo')?.access_token).toBe('at')
  })
  it('overwrites on re-save', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'old', refresh_token: 'r', expires_at: future() })
    saveToken(db, { provider: 'monzo', access_token: 'new', refresh_token: 'r', expires_at: future() })
    expect(getToken(db, 'monzo')?.access_token).toBe('new')
  })
  it('deletes a token', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'at', refresh_token: 'rt', expires_at: future() })
    deleteToken(db, 'monzo')
    expect(getToken(db, 'monzo')).toBeNull()
  })
  it('detects near-expiry', () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 60
    const token = { provider: 'monzo' as const, access_token: 'at', refresh_token: 'rt', expires_at: nearExpiry }
    expect(isTokenExpiredOrExpiringSoon(token)).toBe(true)
  })
  it('not near-expiry for far future', () => {
    const token = { provider: 'monzo' as const, access_token: 'at', refresh_token: 'rt', expires_at: future() }
    expect(isTokenExpiredOrExpiringSoon(token)).toBe(false)
  })
})
