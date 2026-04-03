// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { saveToken } from '@/lib/db/queries/tokens'
import { getGoogleOAuthClient, getGoogleUserEmail } from '@/lib/auth/google'
import { requireSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { getToken } from '@/lib/db/queries/tokens'

export async function GET(req: NextRequest) {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', base))

  const session = requireSession(db, req.cookies.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.redirect(new URL('/auth/login', base))

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error('[google-callback] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured')
    return NextResponse.redirect(new URL('/?error=google_auth_failed', base))
  }

  try {
    const client = getGoogleOAuthClient(clientId, clientSecret)
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token) throw new Error('No access_token returned by Google')

    const email = await getGoogleUserEmail(tokens.access_token)

    // Google only returns refresh_token on first authorisation or when prompt=consent
    // forces a new grant. Fall back to whatever is already stored for this account so
    // re-authorisation doesn't break an existing working connection.
    const existing = getToken(db, 'google', session.userId, email)
    const refreshToken = tokens.refresh_token ?? existing?.refresh_token ?? null

    saveToken(db, {
      provider: 'google',
      email,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: Math.floor((tokens.expiry_date ?? Date.now() + 3_600_000) / 1000),
    }, session.userId)

    return NextResponse.redirect(new URL('/settings', base))
  } catch (err) {
    console.error('[google-callback] token exchange failed:', err)
    return NextResponse.redirect(new URL('/?error=google_auth_failed', base))
  }
}
