// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { saveToken } from '@/lib/db/queries/tokens'
import { getGoogleOAuthClient, getGoogleUserEmail } from '@/lib/auth/google'
import { requireSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const base = process.env.BASE_URL || 'http://localhost:3000'
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', base))

  const session = requireSession(db, req.cookies.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.redirect(new URL('/auth/login', base))

  try {
    const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Missing tokens')

    const email = await getGoogleUserEmail(tokens.access_token)

    saveToken(db, {
      provider: 'google',
      email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Math.floor((tokens.expiry_date ?? Date.now() + 3_600_000) / 1000),
    }, session.userId)

    return NextResponse.redirect(new URL('/settings', base))
  } catch {
    return NextResponse.redirect(new URL('/?error=google_auth_failed', base))
  }
}
