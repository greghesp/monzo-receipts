// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { deleteSessionRow } from '@/lib/db/queries/sessions'
import { clearSessionCookie, SESSION_COOKIE_NAME } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
  if (token) deleteSessionRow(db, token)
  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
