// app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { createUser, hasAnyUsers, getUserByUsername } from '@/lib/db/queries/users'
import { createSessionRow } from '@/lib/db/queries/sessions'
import { hashPassword, generateSessionToken, setSessionCookie, requireSession, SESSION_COOKIE_NAME } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  let username: string | undefined, password: string | undefined
  try {
    ;({ username, password } = await req.json() as { username?: string; password?: string })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!username?.trim() || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
  }

  const isFirstUser = !hasAnyUsers(db)

  // If users already exist, require a valid session (only logged-in users can add accounts)
  if (!isFirstUser) {
    const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
    const session = requireSession(db, token)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (getUserByUsername(db, username)) {
    return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
  }

  const hash = await hashPassword(password)

  // Wrap in a transaction so data migration and user creation are atomic
  const userId = db.transaction(() => {
    const id = createUser(db, username, hash)

    if (isFirstUser) {
      // Reassign orphaned rows (from pre-migration single-user data) to this user
      db.prepare('UPDATE tokens SET user_id = ? WHERE user_id IS NULL').run(id)
      // Keep global config keys as NULL; reassign per-user keys only
      const globalKeys = ['monzo_client_id', 'monzo_client_secret']
      db.prepare(
        `UPDATE config SET user_id = ? WHERE user_id IS NULL AND key NOT IN (${globalKeys.map(() => '?').join(',')})`
      ).run(id, ...globalKeys)
      db.prepare('UPDATE runs SET user_id = ? WHERE user_id IS NULL').run(id)
    }

    return id
  })()

  // Only auto-login for the first user. Subsequent users are created by an already-logged-in user
  // who stays logged in — we do NOT replace their session cookie.
  if (isFirstUser) {
    const sessionToken = generateSessionToken()
    createSessionRow(db, sessionToken, userId)
    const res = NextResponse.json({ ok: true, isFirstUser })
    setSessionCookie(res, sessionToken)
    return res
  }

  return NextResponse.json({ ok: true, isFirstUser })
}
