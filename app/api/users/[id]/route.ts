// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getUserById, deleteUser } from '@/lib/db/queries/users'
import { requireSession } from '@/lib/auth/session'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const targetId = parseInt(params.id, 10)
  if (isNaN(targetId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  if (targetId === session.userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const user = getUserById(db, targetId)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  deleteUser(db, targetId)
  return NextResponse.json({ ok: true })
}
