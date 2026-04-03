'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [form, setForm] = useState({ username: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Determine mode from URL: ?mode=add (logged-in add) vs default (first-run)
  const isAddMode = searchParams.get('mode') === 'add'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Registration failed'); return }
      router.push(isAddMode ? '/settings' : '/')
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">
          {isAddMode ? 'Add User' : 'Create Account'}
        </h1>
        <p className="text-slate-400 text-sm">
          {isAddMode ? 'Create a new user account' : 'First time setup — create your user account'}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Username', key: 'username', type: 'text', autocomplete: 'username' },
          { label: 'Password', key: 'password', type: 'password', autocomplete: 'new-password' },
          { label: 'Confirm Password', key: 'confirm', type: 'password', autocomplete: 'new-password' },
        ].map(({ label, key, type, autocomplete }) => (
          <div key={key}>
            <label className="block text-sm text-slate-300 mb-1">{label}</label>
            <input
              type={type}
              value={form[key as keyof typeof form]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              autoComplete={autocomplete}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
            />
          </div>
        ))}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
        >
          {loading ? 'Creating...' : isAddMode ? 'Add User' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  )
}
