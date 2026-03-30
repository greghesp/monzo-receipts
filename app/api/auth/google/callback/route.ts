import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { saveToken } from '@/lib/db/queries/tokens'
import { getGoogleOAuthClient } from '@/lib/auth/google'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', 'http://localhost:3000'))
  try {
    const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Missing tokens')
    saveToken(db, { provider: 'google', access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Math.floor((tokens.expiry_date ?? Date.now() + 3_600_000) / 1000) })
    return NextResponse.redirect(new URL('/', 'http://localhost:3000'))
  } catch {
    return NextResponse.redirect(new URL('/?error=google_auth_failed', 'http://localhost:3000'))
  }
}
