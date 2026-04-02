import Link from 'next/link'

interface Props { enabled: boolean; cronExpr: string; appriseUrls: string[] }

function nextRunLabel(cron: string): string {
  if (cron === '0 20 * * *') return 'Daily at 8pm'
  if (cron === '0 * * * *') return 'Hourly'
  if (cron === '0 */6 * * *') return 'Every 6 hours'
  return cron
}

export default function ScheduleStatus({ enabled, cronExpr, appriseUrls }: Props) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-700">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-sky-400">⏱</span>
        {enabled ? (
          <span className="text-slate-300">
            Auto-run: <span className="text-white">{nextRunLabel(cronExpr)}</span>
            {appriseUrls.length > 0 && <span className="text-slate-500 ml-2">· 🔔 {appriseUrls.length} notification{appriseUrls.length > 1 ? 's' : ''}</span>}
          </span>
        ) : (
          <span className="text-slate-500">Auto-run disabled</span>
        )}
      </div>
      <Link href="/settings" className="text-xs text-slate-500 hover:text-slate-300">Configure ›</Link>
    </div>
  )
}
