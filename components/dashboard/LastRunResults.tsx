'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ReceiptDetailModal from './ReceiptDetailModal'
import type { MatchRow } from '@/lib/db/queries/matches'

type StatusFilter = 'all' | 'submitted' | 'pending_review' | 'no_match' | 'skipped'

interface RunSummary { completedAt: number; transactionsScanned: number; matched: number; needsReview: number; status: string }
interface Props { run: RunSummary | null; pendingCount: number }
interface Stats { total: number; submitted: number; pending_review: number; no_match: number; skipped: number }

const PAGE_SIZE = 20

const STATUS_CONFIG: Record<StatusFilter, { label: string; icon: string; color: string }> = {
  all:            { label: 'All',         icon: '',  color: 'text-slate-400' },
  submitted:      { label: 'Submitted',   icon: '✓', color: 'text-emerald-400' },
  pending_review: { label: 'Needs Review',icon: '?', color: 'text-amber-400' },
  no_match:       { label: 'No Match',    icon: '–', color: 'text-slate-500' },
  skipped:        { label: 'Skipped',     icon: '·', color: 'text-slate-500' },
}

export default function LastRunResults({ run, pendingCount }: Props) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<MatchRow | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      ...(filter !== 'all' ? { status: filter } : {}),
      ...(onlineOnly ? { online: 'true' } : {}),
    })
    fetch(`/api/matches?${params}`)
      .then(r => r.json())
      .then(d => {
        setMatches(d.matches ?? [])
        setStats(d.stats ?? null)
        setLoading(false)
      })
  }, [run, filter, page, onlineOnly, refreshKey])

  function handleFilterChange(f: StatusFilter) {
    setFilter(f)
    setPage(0)
  }

  function handleOnlineToggle() {
    setOnlineOnly(v => !v)
    setPage(0)
  }

  const date = run
    ? new Date(run.completedAt * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const filterTotal = filter === 'all' ? (stats?.total ?? 0) : (stats?.[filter] ?? 0)
  const totalPages = Math.ceil(filterTotal / PAGE_SIZE)
  const start = page * PAGE_SIZE + 1
  const end = Math.min((page + 1) * PAGE_SIZE, filterTotal)

  return (
    <>
      <div className="bg-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">
                {date ? `Last Run — ${date}` : 'Transactions'}
              </p>
              {run?.status === 'error' && (
                <span className="text-xs text-amber-400 bg-amber-900/40 px-1.5 py-0.5 rounded">last run failed</span>
              )}
            </div>
            {run && <p className="text-xs text-slate-500">{run.transactionsScanned} transactions scanned</p>}
          </div>
          {pendingCount > 0 && (
            <Link href="/review" className="bg-amber-950 text-amber-400 px-3 py-1 rounded-lg text-xs hover:bg-amber-900 transition-colors">
              Review {pendingCount} ›
            </Link>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-slate-700 overflow-x-auto">
          {(Object.keys(STATUS_CONFIG) as StatusFilter[]).map(f => {
            const count = f === 'all' ? (stats?.total ?? 0) : (stats?.[f] ?? 0)
            const cfg = STATUS_CONFIG[f]
            const active = filter === f
            return (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-sky-500 text-white'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {cfg.icon && <span className={cfg.color}>{cfg.icon}</span>}
                {cfg.label}
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 leading-none text-[10px] ${active ? 'bg-sky-900 text-sky-300' : 'bg-slate-700 text-slate-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Secondary filter */}
        <div className="px-4 py-2 border-b border-slate-700/50 flex items-center gap-2">
          <button
            onClick={handleOnlineToggle}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              onlineOnly
                ? 'bg-sky-900/50 border-sky-700 text-sky-300'
                : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            🌐 Online only
          </button>
        </div>

        {/* Match list */}
        <div className="divide-y divide-slate-700/50">
          {loading ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">Loading…</div>
          ) : matches.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">No transactions in this category</div>
          ) : (
            matches.map(m => {
              const cfg = STATUS_CONFIG[m.status as StatusFilter] ?? STATUS_CONFIG.no_match
              const date = m.transaction_date
                ? new Date(m.transaction_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : null
              return (
                <div
                  key={m.id}
                  onClick={() => setSelected(m)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer hover:bg-slate-700/50"
                >
                  <span className={`w-4 text-center flex-shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                  <span className="text-slate-200 flex-1 truncate">{m.merchant}</span>
                  {date && <span className="text-slate-500 text-xs flex-shrink-0">{date}</span>}
                  <span className="text-xs flex-shrink-0" title={m.merchant_online ? 'Online' : 'In-store'}>
                    {m.merchant_online ? '🌐' : '🏪'}
                  </span>
                  <span className="text-slate-400 text-xs flex-shrink-0">£{(m.amount / 100).toFixed(2)}</span>
                </div>
              )
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-slate-500">{start}–{end} of {filterTotal}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages - 1}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Receipt detail modal */}
      {selected && (
        <ReceiptDetailModal
          match={selected}
          onClose={() => setSelected(null)}
          onSubmitted={() => {
            setRefreshKey(k => k + 1)
            setSelected(null)
          }}
        />
      )}
    </>
  )
}
