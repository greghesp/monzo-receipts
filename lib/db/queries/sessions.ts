// lib/db/queries/sessions.ts
import Database from 'better-sqlite3'

export interface SessionRow {
  token: string
  user_id: number
  username: string   // joined from users
  created_at: number
  last_seen_at: number
}

export function createSessionRow(db: Database.Database, token: string, userId: number): void {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, now, now)
}

export function getSessionByToken(db: Database.Database, token: string): SessionRow | null {
  return (db.prepare(`
    SELECT s.token, s.user_id, s.created_at, s.last_seen_at, u.username
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token) as SessionRow | undefined) ?? null
}

export function deleteSessionRow(db: Database.Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export function touchSession(db: Database.Database, token: string): void {
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?')
    .run(Math.floor(Date.now() / 1000), token)
}
