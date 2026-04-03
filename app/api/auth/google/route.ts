import { NextResponse } from 'next/server'
import { buildGoogleAuthUrl } from '@/lib/auth/google'

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured' }, { status: 500 })
  }
  return NextResponse.redirect(buildGoogleAuthUrl(clientId, clientSecret))
}
