import { NextRequest, NextResponse } from 'next/server'
import { runMatch, type RunOptions } from '@/lib/runner'
import { runState } from '@/lib/run-state'

export async function POST(req: NextRequest) {
  if (runState.isRunning) {
    return NextResponse.json({ error: 'A run is already in progress' }, { status: 409 })
  }

  const { accountIds, lookbackDays, onlyOnline } = await req.json() as { accountIds: string[] } & RunOptions
  if (!accountIds?.length) {
    return NextResponse.json({ error: 'accountIds required' }, { status: 400 })
  }

  const options: RunOptions = {}
  if (lookbackDays !== undefined) options.lookbackDays = lookbackDays
  if (onlyOnline !== undefined) options.onlyOnline = onlyOnline

  runState.isRunning = true
  runState.log = []

  // Fire and forget — run continues in the background regardless of this request
  runMatch(accountIds, event => {
    runState.log.push(event)
    if (event.type === 'done' || event.type === 'error') {
      runState.isRunning = false
    }
  }, options).catch(err => {
    runState.log.push({ type: 'error', message: String(err) })
    runState.isRunning = false
  })

  return NextResponse.json({ started: true })
}
