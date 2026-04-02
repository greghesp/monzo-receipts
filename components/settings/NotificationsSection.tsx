'use client'
import { useState } from 'react'

interface Props { appriseUrls: string[] }

export default function NotificationsSection({ appriseUrls }: Props) {
  const [urls, setUrls] = useState(appriseUrls.join('\n'))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  async function save() {
    setSaving(true)
    const parsed = urls.split('\n').map(u => u.trim()).filter(Boolean)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apprise_urls: parsed }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/notifications/test', { method: 'POST' })
    setTestResult(await res.json())
    setTesting(false)
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notifications (Apprise)</h2>
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-slate-500">One Apprise URL per line. Fired on run complete, needs review, and errors. Requires <code className="text-slate-300">pip install apprise</code>.</p>
        <textarea
          value={urls}
          onChange={e => setUrls(e.target.value)}
          rows={4}
          placeholder={'slack://token/channel\nntfy://mytopic\ndiscord://webhook_id/token'}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono resize-none focus:outline-none focus:border-sky-500"
        />
        <div className="flex items-center justify-between">
          <button onClick={sendTest} disabled={testing} className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50">
            {testing ? 'Sending…' : 'Send test notification'}
          </button>
          <button onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {testResult && (
          <p className={`text-xs ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.success ? '✓ Test notification sent' : `✗ ${testResult.error}`}
          </p>
        )}
      </div>
    </section>
  )
}
