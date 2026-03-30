import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatches, getMatchStats } from '@/lib/db/queries/matches'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
  return NextResponse.json({
    matches: getMatches(db, limit, offset),
    stats: getMatchStats(db),
  })
}
