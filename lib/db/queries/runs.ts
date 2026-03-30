// lib/db/queries/runs.ts
import Database from 'better-sqlite3'
import type { RunStatus } from '../../types'

export interface RunRow {
  id: number
  started_at: number
  completed_at: number | null
  status: RunStatus
  cursor_transaction_id: string | null
  transactions_scanned: number
  matched: number
  needs_review: number
  no_match: number
  error_message: string | null
}

export interface RunUpdate {
  status: RunStatus
  cursor_transaction_id?: string | null
  transactions_scanned?: number
  matched?: number
  needs_review?: number
  no_match?: number
  error_message?: string | null
}

export function createRun(db: Database.Database): number {
  const r = db.prepare('INSERT INTO runs (started_at, status) VALUES (?, ?)').run(Math.floor(Date.now() / 1000), 'running')
  return r.lastInsertRowid as number
}

export function updateRun(db: Database.Database, id: number, u: RunUpdate): void {
  db.prepare(`
    UPDATE runs SET
      status = @status, completed_at = @completed_at,
      cursor_transaction_id = COALESCE(@cursor_transaction_id, cursor_transaction_id),
      transactions_scanned = @transactions_scanned, matched = @matched,
      needs_review = @needs_review, no_match = @no_match, error_message = @error_message
    WHERE id = @id
  `).run({ id, status: u.status, completed_at: Math.floor(Date.now() / 1000),
    cursor_transaction_id: u.cursor_transaction_id ?? null,
    transactions_scanned: u.transactions_scanned ?? 0, matched: u.matched ?? 0,
    needs_review: u.needs_review ?? 0, no_match: u.no_match ?? 0,
    error_message: u.error_message ?? null })
}

export function getLastSuccessfulRun(db: Database.Database): RunRow | null {
  return (db.prepare("SELECT * FROM runs WHERE status = 'done' ORDER BY id DESC LIMIT 1").get() as RunRow | undefined) ?? null
}

export function getLastRun(db: Database.Database): RunRow | null {
  return (db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get() as RunRow | undefined) ?? null
}
