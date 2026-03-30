import Link from 'next/link'
import type { MatchRow } from '@/lib/db/queries/matches'

interface RunSummary { completedAt: number; transactionsScanned: number; matched: number; needsReview: number }
interface Props { run: RunSummary | null; recentMatches: MatchRow[]; pendingCount: number }

export default function LastRunResults({ run, recentMatches, pendingCount }: Props) {
  if (!run) return <div className="bg-slate-800 rounded-xl p-4 text-sm text-slate-500">No runs yet — click Run Now to start.</div>

  const date = new Date(run.completedAt * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">Last Run — {date}</p>
          <p className="text-xs text-slate-500">{run.transactionsScanned} transactions scanned</p>
        </div>
        {pendingCount > 0 && (
          <Link href="/review" className="bg-amber-950 text-amber-400 px-3 py-1 rounded-lg text-xs hover:bg-amber-900 transition-colors">
            Review {pendingCount} ›
          </Link>
        )}
      </div>
      <div className="space-y-1.5">
        {recentMatches.slice(0, 8).map(m => (
          <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${m.status === 'pending_review' ? 'bg-amber-950/30 border border-amber-900/50' : 'bg-slate-900'}`}>
            <div className="flex items-center gap-2">
              <span className={m.status === 'submitted' ? 'text-emerald-400' : m.status === 'pending_review' ? 'text-amber-400' : 'text-slate-600'}>
                {m.status === 'submitted' ? '✓' : m.status === 'pending_review' ? '?' : '–'}
              </span>
              <span className="text-slate-200">{m.merchant}</span>
              {m.status === 'pending_review' && <span className="text-xs text-slate-500">· needs review</span>}
            </div>
            <span className="text-slate-400 text-xs">£{(m.amount / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
