'use client'
import { useState } from 'react'
import AccountMultiSelect from '@/components/AccountMultiSelect'

const PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 8pm', value: '0 20 * * *' },
  { label: 'Custom', value: 'custom' },
]
const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90]

interface Account { id: string; description: string; displayName?: string; type: string }
interface Props {
  enabled: boolean; cronExpr: string; accounts: Account[]
  selectedAccounts: string[]; lookbackDays: number; onlyOnline: boolean
}

export default function ScheduleSection({ enabled, cronExpr, accounts, selectedAccounts, lookbackDays, onlyOnline }: Props) {
  const [form, setForm] = useState({ enabled, cronExpr, selectedAccounts, lookbackDays, onlyOnline })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isCustom = !PRESETS.slice(0, -1).find(p => p.value === form.cronExpr)

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: form.enabled, schedule_cron: form.cronExpr, schedule_accounts: form.selectedAccounts, lookback_days: form.lookbackDays, only_online_transactions: form.onlyOnline }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Schedule</h2>
      <div className="bg-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">Auto-run enabled</span>
          <button
            onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            className={`w-10 h-5 rounded-full relative transition-colors ${form.enabled ? 'bg-sky-500' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.enabled ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Frequency</span>
          <select
            value={isCustom ? 'custom' : form.cronExpr}
            onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value === 'custom' ? '' : e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Custom cron expression</label>
            <input
              value={form.cronExpr}
              onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value }))}
              placeholder="0 20 * * *"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono"
            />
          </div>
        )}

        <div>
          <p className="text-sm text-slate-400 mb-2">Accounts to scan</p>
          <AccountMultiSelect accounts={accounts} selected={form.selectedAccounts} onChange={ids => setForm(f => ({ ...f, selectedAccounts: ids }))} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-white">Online transactions only</span>
            <p className="text-xs text-slate-500 mt-0.5">Skip in-store purchases — only process transactions flagged as online by Monzo</p>
          </div>
          <button
            onClick={() => setForm(f => ({ ...f, onlyOnline: !f.onlyOnline }))}
            className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${form.onlyOnline ? 'bg-sky-500' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.onlyOnline ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Lookback window</span>
          <select
            value={form.lookbackDays}
            onChange={e => setForm(f => ({ ...f, lookbackDays: Number(e.target.value) }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {LOOKBACK_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>

        <button onClick={save} disabled={saving} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </section>
  )
}
