import { NextResponse } from 'next/server'
import { buildGoogleAuthUrl } from '@/lib/auth/google'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured' }, { status: 500 })
  }
  const authUrl = buildGoogleAuthUrl(clientId, clientSecret)
  console.log('[google-auth] redirect_uri:', new URL(authUrl).searchParams.get('redirect_uri'))
  console.log('[google-auth] client_id prefix:', new URL(authUrl).searchParams.get('client_id')?.slice(0, 10))
  return NextResponse.redirect(authUrl)
}
