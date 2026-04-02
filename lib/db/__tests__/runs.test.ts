// lib/db/__tests__/runs.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { createRun, updateRun, getLastSuccessfulRun } from '../queries/runs'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('run queries', () => {
  it('creates a run and returns id', () => expect(createRun(makeDb())).toBeGreaterThan(0))
  it('returns null when no successful run', () => expect(getLastSuccessfulRun(makeDb())).toBeNull())
  it('updates and retrieves cursor', () => {
    const db = makeDb()
    const id = createRun(db)
    updateRun(db, id, { status: 'done', cursor_transaction_id: 'tx_abc', transactions_scanned: 5, matched: 4, needs_review: 1, no_match: 0 })
    expect(getLastSuccessfulRun(db)?.cursor_transaction_id).toBe('tx_abc')
  })
})
