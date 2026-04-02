import Database from 'better-sqlite3'
import { getToken, getTokens, saveToken, isTokenExpiredOrExpiringSoon } from './db/queries/tokens'
import { getConfig } from './db/queries/config'
import { refreshMonzoToken } from './auth/monzo'
import { getGoogleOAuthClient } from './auth/google'

export async function getMonzoAccessToken(db: Database.Database, userId: number): Promise<string> {
  const token = getToken(db, 'monzo', userId, '')
  if (!token) throw new Error('Monzo not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token
  return forceRefreshMonzoToken(db, userId)
}

/** Force a token refresh regardless of expiry — use when Monzo rejects the current token */
export async function forceRefreshMonzoToken(db: Database.Database, userId: number): Promise<string> {
  const token = getToken(db, 'monzo', userId, '')
  if (!token) throw new Error('Monzo not connected')
  const clientId = getConfig(db, 'monzo_client_id')
  const clientSecret = getConfig(db, 'monzo_client_secret')
  if (!clientId || !clientSecret) throw new Error('Monzo OAuth credentials not configured')
  const fresh = await refreshMonzoToken(token.refresh_token, clientId, clientSecret)
  saveToken(db, {
    provider: 'monzo',
    email: '',
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + fresh.expires_in,
  }, userId)
  return fresh.access_token
}

/**
 * Refresh (if needed) and return access tokens for ALL connected Gmail accounts.
 * Returns [{email, accessToken}] — empty array if no Gmail accounts connected.
 */
export async function getAllGoogleAccessTokens(
  db: Database.Database,
  userId: number
): Promise<{ email: string; accessToken: string }[]> {
  // Filter out empty-email Google tokens — they are orphaned migration artifacts
  // from accounts connected before the multi-Gmail migration and should not be used.
  const tokens = getTokens(db, 'google', userId).filter(t => t.email !== '')
  if (tokens.length === 0) return []

  const results = await Promise.allSettled(tokens.map(async token => {
    if (!isTokenExpiredOrExpiringSoon(token)) {
      return { email: token.email, accessToken: token.access_token }
    }
    const client = getGoogleOAuthClient(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!
    )
    client.setCredentials({ refresh_token: token.refresh_token })
    const { credentials } = await client.refreshAccessToken()
    if (!credentials.access_token) throw new Error(`Google token refresh failed for ${token.email}`)
    const refreshed = {
      provider: 'google' as const,
      email: token.email,
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token ?? token.refresh_token,
      expires_at: Math.floor((credentials.expiry_date ?? Date.now() + 3_600_000) / 1000),
    }
    saveToken(db, refreshed, userId)
    return { email: token.email, accessToken: credentials.access_token }
  }))

  // Skip failed accounts (log them) rather than throwing for all
  return results.flatMap(r => {
    if (r.status === 'fulfilled') return [r.value]
    console.error(`[getAllGoogleAccessTokens] Token refresh failed for one account:`, r.reason)
    return []
  })
}

/** For cases where you have a specific email to look up (e.g. manual-match per-account retry). */
export async function getGoogleAccessToken(
  db: Database.Database,
  userId: number,
  email: string
): Promise<string> {
  const token = getToken(db, 'google', userId, email)
  if (!token) throw new Error('Gmail not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token

  const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  client.setCredentials({ refresh_token: token.refresh_token })
  const { credentials } = await client.refreshAccessToken()
  if (!credentials.access_token) throw new Error('Google token refresh failed')
  saveToken(db, {
    provider: 'google',
    email,
    access_token: credentials.access_token,
    refresh_token: credentials.refresh_token ?? token.refresh_token,
    expires_at: Math.floor((credentials.expiry_date ?? Date.now() + 3_600_000) / 1000),
  }, userId)
  return credentials.access_token
}
