// lib/db/queries/tokens.ts
import Database from 'better-sqlite3'
import type { Provider } from '../../types'

export interface TokenRow {
  provider: Provider
  access_token: string
  refresh_token: string
  expires_at: number
}

export function getToken(db: Database.Database, provider: Provider): TokenRow | null {
  return (db.prepare('SELECT * FROM tokens WHERE provider = ?').get(provider) as TokenRow | undefined) ?? null
}

export function saveToken(db: Database.Database, token: TokenRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO tokens (provider, access_token, refresh_token, expires_at)
    VALUES (@provider, @access_token, @refresh_token, @expires_at)
  `).run(token)
}

export function deleteToken(db: Database.Database, provider: Provider): void {
  db.prepare('DELETE FROM tokens WHERE provider = ?').run(provider)
}

export function isTokenExpiredOrExpiringSoon(token: TokenRow): boolean {
  return token.expires_at < Math.floor(Date.now() / 1000) + 300
}
