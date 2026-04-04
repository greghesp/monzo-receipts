import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatchesForUserFiltered, getMatchStatsForUser } from '@/lib/db/queries/matches'
import { getUserAccounts, saveUserAccounts } from '@/lib/db/queries/user-accounts'
import { requireSession } from '@/lib/auth/session'
import { getToken } from '@/lib/db/queries/tokens'
import { fetchAccounts } from '@/lib/monzo/accounts'

export async function GET(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  // Lazily populate user_accounts for users who connected Monzo before this
  // feature was added. Without this their pre-existing matches (user_id=NULL)
  // wouldn't be visible because the account_id lookup would return nothing.
  const existing = getUserAccounts(db, userId)
  if (existing.length === 0) {
    const token = getToken(db, 'monzo', userId)
    if (token) {
      try {
        const accounts = await fetchAccounts(token.access_token)
        saveUserAccounts(db, userId, accounts.map(a => ({ id: a.id, type: a.type })))
      } catch { /* non-fatal — query proceeds, may return fewer results */ }
    }
  }

  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
  const status = req.nextUrl.searchParams.get('status') ?? ''
  const onlineOnly = req.nextUrl.searchParams.get('online') === 'true'

  const matches = getMatchesForUserFiltered(db, userId, status, onlineOnly, limit, offset)

  return NextResponse.json({ matches, stats: getMatchStatsForUser(db, userId) })
}
