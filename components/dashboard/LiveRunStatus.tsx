'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface LogEvent {
  type: string
  [key: string]: unknown
}

interface StatusResponse {
  isRunning: boolean
  log: LogEvent[]
  lastRun: {
    id: number
    started_at: number
    status: string
    matched: number
    needs_review: number
    no_match: number
  } | null
}

export default function LiveRunStatus() {
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const wasRunning = useRef(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const resp = await fetch('/api/run-match/status')
        if (resp.ok) {
          const data = await resp.json() as StatusResponse
          setStatus(data)

          // Detect transition from running → done and refresh server data
          if (wasRunning.current && !data.isRunning) {
            router.refresh()
          }
          wasRunning.current = data.isRunning

          // Poll faster while a run is active
          timeoutId = setTimeout(poll, data.isRunning ? 1500 : 5000)
        } else {
          timeoutId = setTimeout(poll, 5000)
        }
      } catch {
        timeoutId = setTimeout(poll, 5000)
      }
    }

    poll()
    return () => clearTimeout(timeoutId)
  }, [router])

  // Nothing to show yet or no recent run
  if (!status || (!status.isRunning && !status.log.length)) return null

  const progressEvents = status.log.filter(e => e.type === 'progress')
  const doneEvent = status.log.find(e => e.type === 'done')
  const errorEvent = status.log.find(e => e.type === 'error')

  return (
    <div className="bg-slate-900 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {status.isRunning ? (
          <>
            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-slate-400">
              Run in progress{progressEvents.length > 0 ? ` — ${progressEvents.length} processed` : '…'}
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
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
            <span className="text-xs text-slate-400">
              Run complete — {doneEvent.matched as number} matched,{' '}
              {doneEvent.needsReview as number} need review,{' '}
              {doneEvent.noMatch as number} no match
            </span>
          </>
        ) : null}
      </div>

      {progressEvents.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {progressEvents.map((e, i) => (
            <p key={i} className="text-xs font-mono text-slate-300">
              {e.status === 'submitted' ? '✓' : e.status === 'pending_review' ? '?' : '–'}{' '}
              {e.merchant as string}{' '}
              <span className="text-slate-500">£{((e.amount as number) / 100).toFixed(2)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
