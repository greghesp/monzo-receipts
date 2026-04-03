// app/api/auth/monzo/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { setConfig } from '@/lib/db/queries/config'
import { saveToken } from '@/lib/db/queries/tokens'
import { exchangeMonzoCode } from '@/lib/auth/monzo'
import { requireSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { fetchAccounts } from '@/lib/monzo/accounts'

export async function GET(req: NextRequest) {
  const base = process.env.BASE_URL ?? 'http://localhost:3000'
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', base))

  const session = requireSession(db, req.cookies.get(SESSION_COOKIE_NAME)?.value)
  if (!session) return NextResponse.redirect(new URL('/auth/login', base))

  try {
    const clientId = process.env.MONZO_CLIENT_ID
    const clientSecret = process.env.MONZO_CLIENT_SECRET
    if (!clientId || !clientSecret) throw new Error('Monzo OAuth credentials not configured')

    const t = await exchangeMonzoCode(code, clientId, clientSecret)
    saveToken(db, {
      provider: 'monzo',
      email: '',
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + t.expires_in,
    }, session.userId)

    // Auto-discover monzo_owner_id from accounts API
    try {
      const accounts = await fetchAccounts(t.access_token)
      if (accounts.length > 0 && accounts[0].owners?.[0]?.user_id) {
        setConfig(db, 'monzo_owner_id', accounts[0].owners[0].user_id, session.userId)
      }
    } catch { /* non-fatal */ }

    return NextResponse.redirect(new URL('/', base))
  } catch {
    return NextResponse.redirect(new URL('/?error=monzo_auth_failed', base))
  }
}
