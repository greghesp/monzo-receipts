import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { getConfig, setConfig, getConfigJson, setConfigJson } from '../queries/config'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('config queries', () => {
  it('returns null for missing key', () => {
    expect(getConfig(makeDb(), 'missing')).toBeNull()
  })
  it('sets and gets a string', () => {
    const db = makeDb()
    setConfig(db, 'monzo_client_id', 'oauth2client_abc')
    expect(getConfig(db, 'monzo_client_id')).toBe('oauth2client_abc')
  })
  it('overwrites existing value', () => {
    const db = makeDb()
    setConfig(db, 'lookback_days', '30')
    setConfig(db, 'lookback_days', '60')
    expect(getConfig(db, 'lookback_days')).toBe('60')
  })
  it('sets and gets JSON', () => {
    const db = makeDb()
    setConfigJson(db, 'schedule_accounts', ['acc_1', 'acc_2'])
    expect(getConfigJson(db, 'schedule_accounts')).toEqual(['acc_1', 'acc_2'])
  })
  it('returns null for missing JSON key', () => {
    expect(getConfigJson(makeDb(), 'apprise_urls')).toBeNull()
  })
})
