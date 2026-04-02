import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { saveToken } from '../db/queries/tokens'
import { setConfig } from '../db/queries/config'
import { createUser } from '../db/queries/users'

jest.mock('../auth/monzo', () => ({
  refreshMonzoToken: jest.fn().mockResolvedValue({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 3600 }),
}))

jest.mock('../auth/google', () => ({
  getGoogleOAuthClient: jest.fn().mockReturnValue({
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn().mockResolvedValue({
      credentials: { access_token: 'refreshed_at', refresh_token: 'new_rt', expiry_date: Date.now() + 3_600_000 },
    }),
  }),
  getGoogleUserEmail: jest.fn(),
}))

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const future = () => Math.floor(Date.now() / 1000) + 7200
const nearExpiry = () => Math.floor(Date.now() / 1000) + 60

describe('getMonzoAccessToken', () => {
  const userId = 1
  let getMonzoAccessToken: (db: Database.Database, userId: number) => Promise<string>

  beforeEach(async () => {
    jest.resetModules()
    ;({ getMonzoAccessToken } = await import('../token-refresh'))
  })

  it('returns current token when not expiring', async () => {
    const db = makeDb()
    createUser(db, 'test', 'pw')
    saveToken(db, { provider: 'monzo', email: '', access_token: 'valid', refresh_token: 'rt', expires_at: future() }, userId)
    setConfig(db, 'monzo_client_id', 'cid')
    setConfig(db, 'monzo_client_secret', 'csec')
    expect(await getMonzoAccessToken(db, userId)).toBe('valid')
  })

  it('throws when no token stored', async () => {
    const db = makeDb()
    await expect(getMonzoAccessToken(db, userId)).rejects.toThrow('Monzo not connected')
  })

  it('refreshes when near expiry', async () => {
    const db = makeDb()
    createUser(db, 'test', 'pw')
    saveToken(db, { provider: 'monzo', email: '', access_token: 'old', refresh_token: 'rt', expires_at: nearExpiry() }, userId)
    setConfig(db, 'monzo_client_id', 'cid')
    setConfig(db, 'monzo_client_secret', 'csec')
    expect(await getMonzoAccessToken(db, userId)).toBe('new_at')
  })
})

describe('getGoogleAccessToken', () => {
  const userId = 1
  let getGoogleAccessToken: (db: Database.Database, userId: number, email: string) => Promise<string>

  beforeEach(async () => {
    jest.resetModules()
    ;({ getGoogleAccessToken } = await import('../token-refresh'))
  })

  it('returns current token when not expiring', async () => {
    const db = makeDb()
    createUser(db, 'test', 'pw')
    saveToken(db, { provider: 'google', email: 'test@gmail.com', access_token: 'valid_google', refresh_token: 'rt', expires_at: future() }, userId)
    expect(await getGoogleAccessToken(db, userId, 'test@gmail.com')).toBe('valid_google')
  })

  it('throws when no token stored', async () => {
    const db = makeDb()
    await expect(getGoogleAccessToken(db, userId, 'test@gmail.com')).rejects.toThrow('Gmail not connected')
  })

  it('refreshes when near expiry', async () => {
    const db = makeDb()
    createUser(db, 'test', 'pw')
    saveToken(db, { provider: 'google', email: 'test@gmail.com', access_token: 'old_google', refresh_token: 'rt', expires_at: nearExpiry() }, userId)
    expect(await getGoogleAccessToken(db, userId, 'test@gmail.com')).toBe('refreshed_at')
  })
})

describe('getAllGoogleAccessTokens', () => {
  let getAllGoogleAccessTokens: (db: Database.Database, userId: number) => Promise<{ email: string; accessToken: string }[]>

  beforeEach(async () => {
    jest.resetModules()
    ;({ getAllGoogleAccessTokens } = await import('../token-refresh'))
  })

  it('returns empty array when no google tokens', async () => {
    const db = makeDb()
    expect(await getAllGoogleAccessTokens(db, 1)).toEqual([])
  })

  it('returns access tokens for all connected accounts', async () => {
    const db = makeDb()
    createUser(db, 'u', 'pw')
    const uid = 1
    saveToken(db, { provider: 'google', email: 'a@gmail.com', access_token: 'at_a', refresh_token: 'rt_a', expires_at: future() }, uid)
    saveToken(db, { provider: 'google', email: 'b@gmail.com', access_token: 'at_b', refresh_token: 'rt_b', expires_at: future() }, uid)
    const result = await getAllGoogleAccessTokens(db, uid)
    expect(result).toHaveLength(2)
    const emails = result.map(r => r.email).sort()
    expect(emails).toEqual(['a@gmail.com', 'b@gmail.com'])
  })

  it('refreshes tokens that are near expiry', async () => {
    const db = makeDb()
    createUser(db, 'u', 'pw')
    const uid = 1
    const nearExp = Math.floor(Date.now() / 1000) + 60
    saveToken(db, { provider: 'google', email: 'a@gmail.com', access_token: 'old_at', refresh_token: 'rt', expires_at: nearExp }, uid)
    const result = await getAllGoogleAccessTokens(db, uid)
    expect(result[0].accessToken).toBe('refreshed_at')
  })

  it('skips an account whose token refresh fails and returns the others', async () => {
    const db = makeDb()
    createUser(db, 'u', 'pw')
    const uid = 1
    const nearExpiry = Math.floor(Date.now() / 1000) + 60

    // First account: near expiry (will try to refresh — mock returns refreshed_at)
    saveToken(db, { provider: 'google', email: 'good@gmail.com', access_token: 'old_at', refresh_token: 'rt_good', expires_at: nearExpiry }, uid)
    // Second account: valid token (won't need refresh)
    saveToken(db, { provider: 'google', email: 'valid@gmail.com', access_token: 'valid_at', refresh_token: 'rt_valid', expires_at: future() }, uid)

    // Make the mock throw for the first account's refresh
    const { getGoogleOAuthClient } = await import('../auth/google')
    ;(getGoogleOAuthClient as jest.Mock).mockReturnValueOnce({
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn().mockRejectedValue(new Error('refresh failed')),
    })

    const result = await getAllGoogleAccessTokens(db, uid)
    // Only the valid account should be returned
    expect(result).toHaveLength(1)
    expect(result[0].email).toBe('valid@gmail.com')
    expect(result[0].accessToken).toBe('valid_at')
  })
})
