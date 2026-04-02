// app/api/run-match/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runMatch, type RunOptions } from '@/lib/runner'
import { getRunState } from '@/lib/run-state'
import { requireSession } from '@/lib/auth/session'
import db from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = getRunState(session.userId)
  if (state.isRunning) {
    return NextResponse.json({ error: 'A run is already in progress' }, { status: 409 })
  }

  let body: { accountIds: string[] } & RunOptions
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { accountIds, lookbackDays, onlyOnline } = body
  if (!accountIds?.length) {
    return NextResponse.json({ error: 'accountIds required' }, { status: 400 })
  }

  const options: RunOptions = {}
  if (lookbackDays !== undefined) options.lookbackDays = lookbackDays
  if (onlyOnline !== undefined) options.onlyOnline = onlyOnline

  state.isRunning = true
  state.log = []

  const userId = session.userId
  runMatch(userId, accountIds, event => {
    state.log.push(event)
    if (event.type === 'done' || event.type === 'error') state.isRunning = false
  }, options).catch(err => {
    state.log.push({ type: 'error', message: String(err) })
    state.isRunning = false
  })

  return NextResponse.json({ started: true })
}
