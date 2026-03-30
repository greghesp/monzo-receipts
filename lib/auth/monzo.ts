import crypto from 'crypto'

const REDIRECT_URI = 'http://localhost:3000/api/auth/monzo/callback'

export function buildMonzoAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state: crypto.randomBytes(16).toString('hex'),
  })
  return `https://auth.monzo.com/?${params}`
}

export async function exchangeMonzoCode(code: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://api.monzo.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, code }),
  })
  if (!resp.ok) throw new Error(`Monzo token exchange failed: ${await resp.text()}`)
  return resp.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function refreshMonzoToken(refreshToken: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://api.monzo.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  })
  if (!resp.ok) throw new Error('Monzo token refresh failed')
  return resp.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}
