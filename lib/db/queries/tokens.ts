// lib/db/queries/tokens.ts
import Database from 'better-sqlite3'
import type { Provider } from '../../types'

export interface TokenRow {
  provider: Provider
  email: string           // '' for Monzo; Gmail address for Google accounts
  access_token: string
  refresh_token: string | null
  expires_at: number
}

/** Get a single token. For Monzo use email=''. For Google pass the specific email. */
export function getToken(
  db: Database.Database,
  provider: Provider,
  userId: number | null = null,
  email = ''
): TokenRow | null {
  return (
    db.prepare(
      'SELECT provider, email, access_token, refresh_token, expires_at FROM tokens WHERE user_id IS ? AND provider = ? AND email = ?'
    ).get(userId, provider, email) as TokenRow | undefined
  ) ?? null
}

/** Get ALL tokens for a provider (used for multiple Gmail accounts). */
export function getTokens(
  db: Database.Database,
  provider: Provider,
  userId: number | null = null
): TokenRow[] {
  return db.prepare(
    'SELECT provider, email, access_token, refresh_token, expires_at FROM tokens WHERE user_id IS ? AND provider = ?'
  ).all(userId, provider) as TokenRow[]
}

export function saveToken(
  db: Database.Database,
  token: TokenRow,
  userId: number | null = null
): void {
  // DELETE + INSERT because SQLite NULL != NULL in composite PKs
  const upsert = db.transaction(() => {
    db.prepare('DELETE FROM tokens WHERE user_id IS ? AND provider = ? AND email = ?')
      .run(userId, token.provider, token.email)
    db.prepare(
      'INSERT INTO tokens (user_id, provider, email, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, token.provider, token.email, token.access_token, token.refresh_token, token.expires_at)
  })
  upsert()
}

export function deleteToken(
  db: Database.Database,
  provider: Provider,
  userId: number | null = null,
  email = ''
): void {
  db.prepare('DELETE FROM tokens WHERE user_id IS ? AND provider = ? AND email = ?')
    .run(userId, provider, email)
}

export function isTokenExpiredOrExpiringSoon(token: TokenRow): boolean {
  return token.expires_at < Math.floor(Date.now() / 1000) + 300
}
