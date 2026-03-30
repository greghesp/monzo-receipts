import { redirect } from 'next/navigation'
import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'
import { getMatchStats, getPendingReviewMatches } from '@/lib/db/queries/matches'
import { getLastRun } from '@/lib/db/queries/runs'
import { fetchAccounts, accountDisplayName } from '@/lib/monzo/accounts'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import StatsRow from '@/components/dashboard/StatsRow'
import RunControlsWrapper from '@/components/dashboard/RunControlsWrapper'
import ScheduleStatus from '@/components/dashboard/ScheduleStatus'
import LastRunResults from '@/components/dashboard/LastRunResults'
import LiveRunStatus from '@/components/dashboard/LiveRunStatus'
import ConnectionBadgesWrapper from '@/components/dashboard/ConnectionBadgesWrapper'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!getConfig(db, 'monzo_client_id')) redirect('/setup')

  const monzoConnected = !!getToken(db, 'monzo')
  const googleConnected = !!getToken(db, 'google')
  const stats = getMatchStats(db)
  const lastRun = getLastRun(db)
  const pendingReviews = getPendingReviewMatches(db)
  const scheduleEnabled = getConfig(db, 'schedule_enabled') === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron') ?? '0 20 * * *'
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts') ?? []
  const lookbackDays = parseInt(getConfig(db, 'lookback_days') ?? '30', 10)
  const onlyOnline = getConfig(db, 'only_online_transactions') === 'true'

  let accounts: { id: string; description: string; displayName: string; type: string }[] = []
  if (monzoConnected) {
    try {
      const token = await getMonzoAccessToken(db)
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
            <Link href="/manual-match" className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg px-2.5 py-1.5 text-sm transition-colors" title="Manual match">✉</Link>
            <Link href="/settings" className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg px-2.5 py-1.5 text-sm transition-colors">⚙</Link>
          </div>
        </div>

        <StatsRow total={stats.total} submitted={stats.submitted} pendingReview={stats.pending_review} noMatch={stats.no_match} />

        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <RunControlsWrapper accounts={accounts} defaultSelected={savedAccounts} defaultLookbackDays={lookbackDays} defaultOnlyOnline={onlyOnline} />
          <ScheduleStatus enabled={scheduleEnabled} cronExpr={scheduleCron} appriseUrls={appriseUrls} />
        </div>

        <LiveRunStatus />

        <LastRunResults run={lastRunSummary} pendingCount={pendingReviews.length} />
      </div>
    </main>
  )
}
