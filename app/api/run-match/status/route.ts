import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getLastRun } from '@/lib/db/queries/runs'
import { runState } from '@/lib/run-state'

export async function GET() {
  const lastRun = getLastRun(db)
  return NextResponse.json({
    isRunning: runState.isRunning,
    log: runState.log,
    lastRun,
  })
}
