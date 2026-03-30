import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getLastRun } from '@/lib/db/queries/runs'

export async function GET() {
  const run = getLastRun(db)
  return NextResponse.json({ run })
}
