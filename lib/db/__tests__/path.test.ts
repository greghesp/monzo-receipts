import path from 'path'
import { homedir } from 'os'

describe('resolveDbPath', () => {
  const originalEnv = process.env.DB_PATH

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DB_PATH
    } else {
      process.env.DB_PATH = originalEnv
    }
    jest.resetModules()
  })

  it('returns ~/.monzo-receipts/db.sqlite when DB_PATH is not set', () => {
    delete process.env.DB_PATH
    jest.resetModules()
    const { resolveDbPath } = require('../path')
    expect(resolveDbPath()).toBe(path.join(homedir(), '.monzo-receipts', 'db.sqlite'))
  })

  it('returns the value of DB_PATH env var when set', () => {
    process.env.DB_PATH = '/data/db.sqlite'
    jest.resetModules()
    const { resolveDbPath } = require('../path')
    expect(resolveDbPath()).toBe('/data/db.sqlite')
  })
})
