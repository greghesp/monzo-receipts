'use client'
import { useState } from 'react'
import AccountMultiSelect from '@/components/AccountMultiSelect'

interface Account { id: string; description: string; type: string }
interface SseEvent { type: string; [key: string]: unknown }

interface Props {
  accounts: Account[]
  defaultSelected: string[]
  onRunComplete: () => void
}

export default function RunControls({ accounts, defaultSelected, onRunComplete }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])

  async function startRun() {
    if (!selected.length) return
    setRunning(true)
    setLog([])

    const resp = await fetch('/api/run-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds: selected }),
    })

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data:'))
      for (const line of lines) {
        const event = JSON.parse(line.slice(5).trim()) as SseEvent
        if (event.type === 'progress') {
          setLog(l => [...l, `${event.status === 'submitted' ? '✓' : event.status === 'pending_review' ? '?' : '–'} ${event.merchant} £${((event.amount as number) / 100).toFixed(2)}`])
        }
        if (event.type === 'done' || event.type === 'error') {
          setRunning(false)
          onRunComplete()
        }
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-400 mb-2">Accounts to scan</p>
          <AccountMultiSelect accounts={accounts} selected={selected} onChange={setSelected} />
        </div>
        <button
          onClick={startRun}
          disabled={running || !selected.length}
          className="mt-6 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
        >
          {running ? 'Running…' : '▶ Run Now'}
        </button>
      </div>
      {log.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto">
          {log.map((l, i) => <p key={i} className="text-xs text-slate-300 font-mono">{l}</p>)}
        </div>
      )}
    </div>
  )
}
