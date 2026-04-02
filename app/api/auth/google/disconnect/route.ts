// app/api/auth/google/disconnect/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { deleteToken } from '@/lib/db/queries/tokens'
import { requireSession } from '@/lib/auth/session'

export async function DELETE(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email query param required' }, { status: 400 })

  deleteToken(db, 'google', session.userId, email)
  return NextResponse.json({ ok: true })
}
