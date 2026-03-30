import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig } from '@/lib/db/queries/config'
import { buildMonzoAuthUrl } from '@/lib/auth/monzo'

export async function GET() {
  const clientId = getConfig(db, 'monzo_client_id')
  if (!clientId) return NextResponse.redirect(new URL('/setup', 'http://localhost:3000'))
  return NextResponse.redirect(buildMonzoAuthUrl(clientId))
}
