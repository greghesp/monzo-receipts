'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ client_id: '', client_secret: '', owner_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monzo_client_id: form.client_id,
          monzo_client_secret: form.client_secret,
          monzo_owner_id: form.owner_id,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/api/auth/monzo')
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Setup</h1>
        <p className="text-slate-400 text-sm mb-8">
          Enter your Monzo OAuth client credentials. Create a client at{' '}
          <a href="https://developers.monzo.com" target="_blank" className="text-sky-400 underline">developers.monzo.com</a>{' '}
          with redirect URL <code className="text-slate-300">http://localhost:3000/api/auth/monzo/callback</code> and type <strong>Confidential</strong>.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Client ID', key: 'client_id', placeholder: 'oauth2client_...' },
            { label: 'Client Secret', key: 'client_secret', placeholder: '' },
            { label: 'Owner ID', key: 'owner_id', placeholder: 'user_...' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-sm text-slate-300 mb-1">{label}</label>
              <input
                type={key === 'client_secret' ? 'password' : 'text'}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
          ))}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Connect Monzo'}
          </button>
        </form>
      </div>
    </main>
  )
}
