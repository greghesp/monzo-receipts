import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken, getTokens } from '@/lib/db/queries/tokens'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { fetchAccounts, accountDisplayName } from '@/lib/monzo/accounts'
import { requireSession } from '@/lib/auth/session'
import { getAllUsers } from '@/lib/db/queries/users'
import ConnectionsSection from '@/components/settings/ConnectionsSection'
import ScheduleSection from '@/components/settings/ScheduleSection'
import NotificationsSection from '@/components/settings/NotificationsSection'
import UsersSection from '@/components/settings/UsersSection'
import ResetCursorButton from '@/components/settings/ResetCursorButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = requireSession(db, cookies().get('session')?.value)
  if (!session) redirect('/auth/login')
  const { userId } = session

  const monzoConnected = !!getToken(db, 'monzo', userId)
  const googleTokens = getTokens(db, 'google', userId)
  const googleAccounts = googleTokens.map(t => t.email)
  const scheduleEnabled = getConfig(db, 'schedule_enabled', userId) === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron', userId) ?? '0 20 * * *'
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts', userId) ?? []
  const lookbackDays = parseInt(getConfig(db, 'lookback_days', userId) ?? '30', 10)
  const onlyOnline = getConfig(db, 'only_online_transactions', userId) === 'true'
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls', userId) ?? []

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
    } catch { /* token expired */ }
  }

  const allUsers = getAllUsers(db).map(u => ({
    id: u.id, username: u.username, isCurrentUser: u.id === userId,
  }))

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Dashboard</Link>
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
        <ConnectionsSection monzoConnected={monzoConnected} googleAccounts={googleAccounts} />
        <ScheduleSection enabled={scheduleEnabled} cronExpr={scheduleCron} accounts={accounts} selectedAccounts={savedAccounts} lookbackDays={lookbackDays} onlyOnline={onlyOnline} />
        <NotificationsSection appriseUrls={appriseUrls} />
        <UsersSection users={allUsers} />

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
