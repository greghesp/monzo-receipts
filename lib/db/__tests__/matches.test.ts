// lib/db/__tests__/matches.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { upsertMatch, getMatchByTransactionId, getPendingReviewMatches, getMatchStats } from '../queries/matches'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const base = { external_id: null, merchant: 'X', amount: 100, currency: 'GBP', receipt_data: null }

describe('match queries', () => {
  it('inserts and retrieves a match', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    expect(getMatchByTransactionId(db, 'tx_1')?.status).toBe('submitted')
  })
  it('updates on conflict', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    expect(getMatchByTransactionId(db, 'tx_1')?.status).toBe('submitted')
  })
  it('returns pending review matches', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_2', status: 'submitted', confidence: 'high' })
    expect(getPendingReviewMatches(db)).toHaveLength(1)
  })
  it('returns correct stats', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    upsertMatch(db, { ...base, transaction_id: 'tx_2', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_3', status: 'no_match', confidence: null })
    const s = getMatchStats(db)
    expect(s).toEqual({ total: 3, submitted: 1, pending_review: 1, no_match: 1, skipped: 0 })
  })
})
