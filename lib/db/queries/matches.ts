// lib/db/queries/matches.ts
import Database from 'better-sqlite3'
import type { MatchStatus, Confidence } from '../../types'

export interface MatchRow {
  id: number
  transaction_id: string
  external_id: string | null
  merchant: string
  amount: number
  currency: string
  status: MatchStatus
  confidence: Confidence | null
  receipt_data: string | null
  matched_at: number
}

export interface UpsertMatchInput {
  transaction_id: string
  external_id: string | null
  merchant: string
  amount: number
  currency: string
  status: MatchStatus
  confidence: Confidence | null
  receipt_data: string | null
}

export function upsertMatch(db: Database.Database, input: UpsertMatchInput): void {
  db.prepare(`
    INSERT INTO matches (transaction_id, external_id, merchant, amount, currency, status, confidence, receipt_data, matched_at)
    VALUES (@transaction_id, @external_id, @merchant, @amount, @currency, @status, @confidence, @receipt_data, @matched_at)
    ON CONFLICT(transaction_id) DO UPDATE SET
      external_id = excluded.external_id, status = excluded.status,
      confidence = excluded.confidence, receipt_data = excluded.receipt_data,
      matched_at = excluded.matched_at
  `).run({ ...input, matched_at: Math.floor(Date.now() / 1000) })
}

export function getMatchByTransactionId(db: Database.Database, txId: string): MatchRow | null {
  return (db.prepare('SELECT * FROM matches WHERE transaction_id = ?').get(txId) as MatchRow | undefined) ?? null
}

export function getMatchById(db: Database.Database, id: number): MatchRow | null {
  return (db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined) ?? null
}

export function getPendingReviewMatches(db: Database.Database): MatchRow[] {
  return db.prepare("SELECT * FROM matches WHERE status = 'pending_review' ORDER BY matched_at DESC").all() as MatchRow[]
}

export function updateMatchStatus(db: Database.Database, id: number, status: MatchStatus): void {
  db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, id)
}

export function getMatches(db: Database.Database, limit = 50, offset = 0): MatchRow[] {
  return db.prepare('SELECT * FROM matches ORDER BY matched_at DESC LIMIT ? OFFSET ?').all(limit, offset) as MatchRow[]
}

export function getMatchStats(db: Database.Database): { total: number; submitted: number; pending_review: number; no_match: number; skipped: number } {
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM matches GROUP BY status').all() as { status: MatchStatus; count: number }[]
  const m = Object.fromEntries(rows.map(r => [r.status, r.count]))
  return { total: rows.reduce((s, r) => s + r.count, 0), submitted: m.submitted ?? 0, pending_review: m.pending_review ?? 0, no_match: m.no_match ?? 0, skipped: m.skipped ?? 0 }
}
