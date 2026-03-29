import Database from 'better-sqlite3'

export function getConfig(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setConfig(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value)
}

export function getConfigJson<T>(db: Database.Database, key: string): T | null {
  const raw = getConfig(db, key)
  return raw === null ? null : JSON.parse(raw) as T
}

export function setConfigJson<T>(db: Database.Database, key: string, value: T): void {
  setConfig(db, key, JSON.stringify(value))
}
