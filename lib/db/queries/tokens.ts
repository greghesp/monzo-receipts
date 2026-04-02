// lib/db/queries/tokens.ts
import Database from 'better-sqlite3'
import type { Provider } from '../../types'

export interface TokenRow {
  provider: Provider
  access_token: string
  refresh_token: string
  expires_at: number
  user_id?: number | null
}

export function getToken(db: Database.Database, provider: Provider, userId: number | null = null): TokenRow | null {
  return (db.prepare('SELECT * FROM tokens WHERE user_id IS ? AND provider = ?').get(userId, provider) as TokenRow | undefined) ?? null
}

export function saveToken(db: Database.Database, token: TokenRow, userId: number | null = null): void {
  // Use delete+insert because SQLite NULL != NULL in composite PKs, so INSERT OR REPLACE
  // creates duplicates when user_id is NULL.
  const upsert = db.transaction(() => {
    db.prepare('DELETE FROM tokens WHERE user_id IS ? AND provider = ?').run(userId, token.provider)
    db.prepare('INSERT INTO tokens (user_id, provider, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, token.provider, token.access_token, token.refresh_token, token.expires_at)
  })
  upsert()
}

export function deleteToken(db: Database.Database, provider: Provider, userId: number | null = null): void {
  db.prepare('DELETE FROM tokens WHERE user_id IS ? AND provider = ?').run(userId, provider)
}

export function isTokenExpiredOrExpiringSoon(token: TokenRow): boolean {
  return token.expires_at < Math.floor(Date.now() / 1000) + 300
}
