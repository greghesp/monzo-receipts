// lib/db/queries/users.ts
import Database from 'better-sqlite3'

export interface UserRow {
  id: number
  username: string
  password_hash: string
  created_at: number
}

export function createUser(db: Database.Database, username: string, passwordHash: string): number {
  const r = db.prepare(
    'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, passwordHash, Math.floor(Date.now() / 1000))
  return r.lastInsertRowid as number
}

export function getUserByUsername(db: Database.Database, username: string): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined) ?? null
}

export function getUserById(db: Database.Database, id: number): UserRow | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
}

export function getAllUsers(db: Database.Database): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[]
}

export function deleteUser(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

export function hasAnyUsers(db: Database.Database): boolean {
  const row = db.prepare('SELECT 1 FROM users LIMIT 1').get()
  return row !== undefined
}
