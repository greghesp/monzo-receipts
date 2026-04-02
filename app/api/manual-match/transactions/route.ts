import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig } from '@/lib/db/queries/config'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import { fetchAccounts } from '@/lib/monzo/accounts'
import { fetchTransactionsSince } from '@/lib/monzo/transactions'

export async function GET(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  try {
    const monzoToken = await getMonzoAccessToken(db, userId)
    const accounts = await fetchAccounts(monzoToken)
    const lookbackDays = parseInt(getConfig(db, 'lookback_days', userId) ?? '30', 10)
    const sinceDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()

    const transactions = (
      await Promise.all(accounts.map(a => fetchTransactionsSince(monzoToken, a.id, sinceDate)))
    ).flat()

    // Sort newest first
    transactions.sort((a, b) => b.created.localeCompare(a.created))

    return NextResponse.json({ transactions })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
