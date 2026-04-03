import { NextResponse } from 'next/server'
import { buildMonzoAuthUrl } from '@/lib/auth/monzo'

export async function GET() {
  const clientId = process.env.MONZO_CLIENT_ID
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
  if (!clientId) return NextResponse.json({ error: 'MONZO_CLIENT_ID not configured' }, { status: 500 })
  return NextResponse.redirect(buildMonzoAuthUrl(clientId))
}
