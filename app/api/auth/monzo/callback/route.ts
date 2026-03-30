import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig } from '@/lib/db/queries/config'
import { saveToken } from '@/lib/db/queries/tokens'
import { exchangeMonzoCode } from '@/lib/auth/monzo'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', 'http://localhost:3000'))
  try {
    const t = await exchangeMonzoCode(code, getConfig(db, 'monzo_client_id')!, getConfig(db, 'monzo_client_secret')!)
    saveToken(db, { provider: 'monzo', access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Math.floor(Date.now() / 1000) + t.expires_in })
    return NextResponse.redirect(new URL('/', 'http://localhost:3000'))
  } catch {
    return NextResponse.redirect(new URL('/?error=monzo_auth_failed', 'http://localhost:3000'))
  }
}
