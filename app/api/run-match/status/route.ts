// app/api/run-match/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getLastRun } from '@/lib/db/queries/runs'
import { getRunState } from '@/lib/run-state'
import { requireSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = getRunState(session.userId)
  const lastRun = getLastRun(db, session.userId)
  return NextResponse.json({ isRunning: state.isRunning, log: state.log, lastRun })
}
