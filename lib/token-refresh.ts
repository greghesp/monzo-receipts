import Database from 'better-sqlite3'
import { getToken, saveToken, isTokenExpiredOrExpiringSoon } from './db/queries/tokens'
import { getConfig } from './db/queries/config'
import { refreshMonzoToken } from './auth/monzo'
import { getGoogleOAuthClient } from './auth/google'

export async function getMonzoAccessToken(db: Database.Database): Promise<string> {
  const token = getToken(db, 'monzo')
  if (!token) throw new Error('Monzo not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token

  const clientId = getConfig(db, 'monzo_client_id')!
  const clientSecret = getConfig(db, 'monzo_client_secret')!
  const fresh = await refreshMonzoToken(token.refresh_token, clientId, clientSecret)
  saveToken(db, { provider: 'monzo', access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: Math.floor(Date.now() / 1000) + fresh.expires_in })
  return fresh.access_token
}

export async function getGoogleAccessToken(db: Database.Database): Promise<string> {
  const token = getToken(db, 'google')
  if (!token) throw new Error('Gmail not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token

  const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  client.setCredentials({ refresh_token: token.refresh_token })
  const { credentials } = await client.refreshAccessToken()
  if (!credentials.access_token) throw new Error('Google token refresh failed')
  saveToken(db, { provider: 'google', access_token: credentials.access_token, refresh_token: credentials.refresh_token ?? token.refresh_token, expires_at: Math.floor((credentials.expiry_date ?? Date.now() + 3_600_000) / 1000) })
  return credentials.access_token
}
