// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getAllUsers } from '@/lib/db/queries/users'
import { requireSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const users = getAllUsers(db).map(u => ({
    id: u.id,
    username: u.username,
    createdAt: u.created_at,
    isCurrentUser: u.id === session.userId,
  }))
  return NextResponse.json({ users })
}
