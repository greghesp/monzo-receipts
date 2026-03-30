import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { fetchAccounts, accountDisplayName } from '@/lib/monzo/accounts'
import ConnectionsSection from '@/components/settings/ConnectionsSection'
import ScheduleSection from '@/components/settings/ScheduleSection'
import NotificationsSection from '@/components/settings/NotificationsSection'
import ResetCursorButton from '@/components/settings/ResetCursorButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const monzoConnected = !!getToken(db, 'monzo')
  const googleConnected = !!getToken(db, 'google')
  const scheduleEnabled = getConfig(db, 'schedule_enabled') === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron') ?? '0 20 * * *'
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts') ?? []
  const lookbackDays = parseInt(getConfig(db, 'lookback_days') ?? '30', 10)
  const onlyOnline = getConfig(db, 'only_online_transactions') === 'true'
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls') ?? []

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
    } catch { /* token expired */ }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Dashboard</Link>
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
        <ConnectionsSection monzoConnected={monzoConnected} googleConnected={googleConnected} />
        <ScheduleSection enabled={scheduleEnabled} cronExpr={scheduleCron} accounts={accounts} selectedAccounts={savedAccounts} lookbackDays={lookbackDays} onlyOnline={onlyOnline} />
        <NotificationsSection appriseUrls={appriseUrls} />

        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-white">Data</h2>
          <p className="text-xs text-slate-400">
            Clearing the cursor resets the transaction watermark so the next run re-scans from your full lookback window. All stored match history is also removed.
          </p>
          <ResetCursorButton />
        </div>
      </div>
    </main>
  )
}
