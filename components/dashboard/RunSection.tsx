'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AccountMultiSelect from '@/components/AccountMultiSelect'

interface Account { id: string; description: string; displayName?: string; type: string }

interface Props {
  accounts: Account[]
  defaultSelected: string[]
  defaultLookbackDays: number
  defaultOnlyOnline: boolean
}

interface LogEvent {
  type: string
  [key: string]: unknown
}

interface StatusResponse {
  isRunning: boolean
  log: LogEvent[]
}

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90]

export default function RunSection({ accounts, defaultSelected, defaultLookbackDays, defaultOnlyOnline }: Props) {
  const router = useRouter()

  // Run controls state
  const [selected, setSelected] = useState<string[]>(defaultSelected)
  const [lookbackDays, setLookbackDays] = useState(defaultLookbackDays)
  const [onlyOnline, setOnlyOnline] = useState(defaultOnlyOnline)

  // Live run status state — optimistically set to true immediately on click
  const [isRunning, setIsRunning] = useState(false)
  const [log, setLog] = useState<LogEvent[]>([])
  const wasRunning = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref to the current poll function so startRun can trigger it directly
  const pollFnRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      if (cancelled) return
      try {
        const resp = await fetch('/api/run-match/status')
        if (cancelled) return
        if (resp.ok) {
          const data = await resp.json() as StatusResponse
          setIsRunning(data.isRunning)
          setLog(data.log)
          if (wasRunning.current && !data.isRunning) router.refresh()
          wasRunning.current = data.isRunning

          // Fast poll while running, slow poll when idle (still catches scheduler runs)
          timerRef.current = setTimeout(poll, data.isRunning ? 1000 : 30_000)
        } else {
          timerRef.current = setTimeout(poll, 30_000)
        }
      } catch {
        if (!cancelled) timerRef.current = setTimeout(poll, 30_000)
      }
    }

    pollFnRef.current = poll
    poll()
    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [router])

  async function startRun() {
    if (!selected.length || isRunning) return
    // Optimistically show running state immediately — don't wait for first poll
    setIsRunning(true)
    setLog([])
    wasRunning.current = true

    await fetch('/api/run-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds: selected, lookbackDays, onlyOnline }),
    })

    // Cancel the pending idle timer and immediately poll so we pick up the
    // completed (or in-progress) state without waiting up to 5 seconds
    if (timerRef.current) clearTimeout(timerRef.current)
    pollFnRef.current?.()
  }

  const startEvent = log.find(e => e.type === 'start')
  const scanningEvents = log.filter(e => e.type === 'scanning')
  const latestScan = scanningEvents[scanningEvents.length - 1] as { type: 'scanning'; emailsFound: number; emailsProcessed: number } | undefined
  const progressEvents = log.filter(e => e.type === 'progress')
  const doneEvent = log.find(e => e.type === 'done')
  const errorEvent = log.find(e => e.type === 'error')
  const total = (startEvent?.transactionCount as number) ?? 0
  const progress = total > 0 ? Math.round((progressEvents.length / total) * 100) : 0
  // During email scanning phase, derive a sub-progress to fill the bar
  const scanProgress = latestScan && latestScan.emailsFound > 0
    ? Math.round((latestScan.emailsProcessed / latestScan.emailsFound) * 100)
    : 0
  const isScanning = isRunning && !!latestScan && progressEvents.length === 0
  const hasActivity = isRunning || log.length > 0

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="space-y-3">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="text-xs text-slate-400 mb-2">Accounts to scan</p>
            <AccountMultiSelect accounts={accounts} selected={selected} onChange={setSelected} />
          </div>
          <button
            onClick={startRun}
            disabled={isRunning || !selected.length}
            className="mt-6 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
          >
            {isRunning ? '⏳ Running…' : '▶ Run Now'}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Lookback</label>
            <select
              value={lookbackDays}
              onChange={e => setLookbackDays(Number(e.target.value))}
              disabled={isRunning}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white disabled:opacity-40"
            >
              {LOOKBACK_OPTIONS.map(d => (
                <option key={d} value={d}>{d} days</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setOnlyOnline(v => !v)}
            disabled={isRunning}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              onlyOnline
                ? 'bg-sky-900/50 border-sky-700 text-sky-300'
                : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'
            }`}
          >
            🌐 Online only
          </button>
        </div>
      </div>

      {/* Live status — shown immediately when run starts, persists until next run */}
      {hasActivity && (
        <div className="bg-slate-900 rounded-xl p-4 space-y-3">
          {/* Status line */}
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
                <span className="text-xs text-slate-400">
                  {isScanning
                    ? `Scanning emails… ${latestScan!.emailsProcessed} / ${latestScan!.emailsFound}`
                    : total > 0
                    ? `Matching… ${progressEvents.length} / ${total} transactions`
                    : 'Starting…'}
                </span>
              </>
            ) : errorEvent ? (
              (errorEvent.message as string) === 'MONZO_REAUTH_REQUIRED' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-400">Monzo session expired (90-day limit) —</span>
                  <a href="/api/auth/monzo" className="text-xs text-sky-400 hover:text-sky-300 underline transition-colors">
                    Reconnect Monzo
                  </a>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-400">Run failed: {errorEvent.message as string}</span>
                </>
              )
            ) : doneEvent ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-xs text-slate-400">
                  Complete — {doneEvent.matched as number} matched,{' '}
                  {doneEvent.needsReview as number} need review,{' '}
                  {doneEvent.noMatch as number} no match
                </span>
              </>
            ) : null}
          </div>

          {/* Progress bar */}
          {isRunning && (total > 0 || isScanning) && (
            <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${isScanning ? 'bg-sky-500' : 'bg-orange-400'}`}
                style={{ width: `${isScanning ? scanProgress : progress}%` }}
              />
            </div>
          )}

          {/* Per-transaction log */}
          {progressEvents.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {progressEvents.map((e, i) => (
                <p key={i} className="text-xs font-mono text-slate-400">
                  <span className={
                    e.status === 'submitted' ? 'text-emerald-400' :
                    e.status === 'pending_review' ? 'text-amber-400' : 'text-slate-500'
                  }>
                    {e.status === 'submitted' ? '✓' : e.status === 'pending_review' ? '?' : '–'}
                  </span>{' '}
                  {e.merchant as string}{' '}
                  <span className="text-slate-600">£{((e.amount as number) / 100).toFixed(2)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
