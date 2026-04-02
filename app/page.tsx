import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken, getTokens } from '@/lib/db/queries/tokens'
import { getMatchStats, getPendingReviewMatches } from '@/lib/db/queries/matches'
import { getLastRun } from '@/lib/db/queries/runs'
import { fetchAccounts, accountDisplayName } from '@/lib/monzo/accounts'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import { hasAnyUsers } from '@/lib/db/queries/users'
import StatsRow from '@/components/dashboard/StatsRow'
import RunSection from '@/components/dashboard/RunSection'
import ScheduleStatus from '@/components/dashboard/ScheduleStatus'
import LastRunResults from '@/components/dashboard/LastRunResults'
import ConnectionBadgesWrapper from '@/components/dashboard/ConnectionBadgesWrapper'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!getConfig(db, 'monzo_client_id')) redirect('/setup')
  if (!hasAnyUsers(db)) redirect('/auth/register')
  const session = requireSession(db, cookies().get('session')?.value)
  if (!session) redirect('/auth/login')
  const { userId, username } = session

  const monzoConnected = !!getToken(db, 'monzo', userId)
  const googleTokens = getTokens(db, 'google', userId)
  const googleConnected = googleTokens.length > 0
  const stats = getMatchStats(db)
  const lastRun = getLastRun(db, userId)
  const pendingReviews = getPendingReviewMatches(db)
  const scheduleEnabled = getConfig(db, 'schedule_enabled', userId) === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron', userId) ?? '0 20 * * *'
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls', userId) ?? []
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts', userId) ?? []
  const lookbackDays = parseInt(getConfig(db, 'lookback_days', userId) ?? '30', 10)
  const onlyOnline = getConfig(db, 'only_online_transactions', userId) === 'true'

  let accounts: { id: string; description: string; displayName: string; type: string }[] = []
  if (monzoConnected) {
    try {
      const token = await getMonzoAccessToken(db, userId)
      accounts = (await fetchAccounts(token)).map(a => ({
        id: a.id,
        description: a.description,
        displayName: accountDisplayName(a),
        type: a.type,
      }))
    } catch { /* token expired — show reconnect */ }
  }

  // Pass run info even on failure so LastRunResults still shows historical matches
  const lastRunSummary = lastRun ? {
    completedAt: lastRun.completed_at ?? lastRun.started_at,
    transactionsScanned: lastRun.transactions_scanned,
    matched: lastRun.matched,
    needsReview: lastRun.needs_review,
    status: lastRun.status,
  } : null

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Monzo Receipt Matching</h1>
            {lastRun && <p className="text-xs text-slate-500 mt-0.5">Last synced: {new Date(lastRun.started_at * 1000).toLocaleString('en-GB')} · cursor saved</p>}
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadgesWrapper monzoConnected={monzoConnected} googleConnected={googleConnected} />
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                {username[0]?.toUpperCase() ?? '?'}
              </div>
              <span className="text-xs text-slate-400">{username}</span>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 rounded px-2 py-1">
                  Sign out
                </button>
              </form>
            </div>
            <Link href="/manual-match" className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg px-2.5 py-1.5 text-sm transition-colors" title="Manual match">✉</Link>
            <Link href="/settings" className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg px-2.5 py-1.5 text-sm transition-colors">⚙</Link>
          </div>
        </div>

        <StatsRow total={stats.total} submitted={stats.submitted} pendingReview={stats.pending_review} noMatch={stats.no_match} />

        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <RunSection accounts={accounts} defaultSelected={savedAccounts} defaultLookbackDays={lookbackDays} defaultOnlyOnline={onlyOnline} />
          <ScheduleStatus enabled={scheduleEnabled} cronExpr={scheduleCron} appriseUrls={appriseUrls} />
        </div>

        <LastRunResults run={lastRunSummary} pendingCount={pendingReviews.length} accounts={accounts} />
      </div>
    </main>
  )
}
