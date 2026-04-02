// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getUserByUsername } from '@/lib/db/queries/users'
import { createSessionRow } from '@/lib/db/queries/sessions'
import { verifyPassword, generateSessionToken, setSessionCookie } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json() as { username?: string; password?: string }
  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const user = getUserByUsername(db, username)
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  const token = generateSessionToken()
  createSessionRow(db, token, user.id)

  const res = NextResponse.json({ ok: true })
  setSessionCookie(res, token)
  return res
}
