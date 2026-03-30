import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatches, getMatchStats } from '@/lib/db/queries/matches'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
  const status = req.nextUrl.searchParams.get('status')

  const onlineOnly = req.nextUrl.searchParams.get('online') === 'true'

  let matches: ReturnType<typeof getMatches>
  if (status && onlineOnly) {
    matches = db.prepare('SELECT * FROM matches WHERE status = ? AND merchant_online = 1 ORDER BY matched_at DESC LIMIT ? OFFSET ?').all(status, limit, offset) as ReturnType<typeof getMatches>
  } else if (status) {
    matches = db.prepare('SELECT * FROM matches WHERE status = ? ORDER BY matched_at DESC LIMIT ? OFFSET ?').all(status, limit, offset) as ReturnType<typeof getMatches>
  } else if (onlineOnly) {
    matches = db.prepare('SELECT * FROM matches WHERE merchant_online = 1 ORDER BY matched_at DESC LIMIT ? OFFSET ?').all(limit, offset) as ReturnType<typeof getMatches>
  } else {
    matches = getMatches(db, limit, offset)
  }

  return NextResponse.json({ matches, stats: getMatchStats(db) })
}
