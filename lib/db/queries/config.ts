import Database from 'better-sqlite3'

export function getConfig(db: Database.Database, key: string, userId: number | null = null): string | null {
  const row = db.prepare('SELECT value FROM config WHERE user_id IS ? AND key = ?').get(userId, key) as { value: string } | undefined
  return row?.value ?? null
}

export function setConfig(db: Database.Database, key: string, value: string, userId: number | null = null): void {
  // Use delete+insert because SQLite NULL != NULL in composite PKs, so INSERT OR REPLACE
  // creates duplicates when user_id is NULL.
  const upsert = db.transaction(() => {
    db.prepare('DELETE FROM config WHERE user_id IS ? AND key = ?').run(userId, key)
    db.prepare('INSERT INTO config (user_id, key, value) VALUES (?, ?, ?)').run(userId, key, value)
  })
  upsert()
}

export function getConfigJson<T>(db: Database.Database, key: string, userId: number | null = null): T | null {
  const raw = getConfig(db, key, userId)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setConfigJson<T>(db: Database.Database, key: string, value: T, userId: number | null = null): void {
  setConfig(db, key, JSON.stringify(value), userId)
}
