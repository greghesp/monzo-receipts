import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { saveToken } from '../db/queries/tokens'
import { setConfig } from '../db/queries/config'
import { createUser } from '../db/queries/users'

jest.mock('../auth/monzo', () => ({
  refreshMonzoToken: jest.fn().mockResolvedValue({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 3600 }),
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
