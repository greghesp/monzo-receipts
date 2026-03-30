'use client'
import { useState } from 'react'
import AccountMultiSelect from '@/components/AccountMultiSelect'

interface Account { id: string; description: string; displayName?: string; type: string }

interface Props {
  accounts: Account[]
  defaultSelected: string[]
  defaultLookbackDays: number
  defaultOnlyOnline: boolean
}

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90]

export default function RunControls({ accounts, defaultSelected, defaultLookbackDays, defaultOnlyOnline }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)
  const [lookbackDays, setLookbackDays] = useState(defaultLookbackDays)
  const [onlyOnline, setOnlyOnline] = useState(defaultOnlyOnline)
  const [starting, setStarting] = useState(false)

  async function startRun() {
    if (!selected.length || starting) return
    setStarting(true)
    try {
      await fetch('/api/run-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: selected, lookbackDays, onlyOnline }),
      })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-400 mb-2">Accounts to scan</p>
          <AccountMultiSelect accounts={accounts} selected={selected} onChange={setSelected} />
        </div>
        <button
          onClick={startRun}
          disabled={starting || !selected.length}
          className="mt-6 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
        >
          {starting ? 'Starting…' : '▶ Run Now'}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">Lookback</label>
          <select
            value={lookbackDays}
            onChange={e => setLookbackDays(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
          >
            {LOOKBACK_OPTIONS.map(d => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setOnlyOnline(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            onlyOnline
              ? 'bg-sky-900/50 border-sky-700 text-sky-300'
              : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          🌐 Online only
        </button>
      </div>
    </div>
  )
}
