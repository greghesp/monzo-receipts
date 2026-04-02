'use client'
import { useState } from 'react'

interface Props {
  monzoConnected: boolean
  googleAccounts: string[]   // list of connected Gmail addresses
}

export default function ConnectionsSection({ monzoConnected, googleAccounts }: Props) {
  const [accounts, setAccounts] = useState(googleAccounts)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDisconnect(email: string) {
    setDisconnecting(email)
    setError(null)
    const previous = accounts
    setAccounts(a => a.filter(e => e !== email))   // optimistic
    try {
      const res = await fetch(`/api/auth/google/disconnect?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setAccounts(previous)
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to disconnect')
      }
    } catch {
      setAccounts(previous)
      setError('Something went wrong')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Connections</h2>
      <div className="bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-700">
        {/* Monzo — single connection */}
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm text-white">Monzo</p>
            <p className={`text-xs mt-0.5 ${monzoConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {monzoConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
          <a
            href="/api/auth/monzo"
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {monzoConnected ? 'Reconnect' : 'Connect'}
          </a>
        </div>

        {/* Gmail — multiple connections */}
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-white">Gmail</p>
          {accounts.length === 0 && (
            <p className="text-xs text-slate-500">No accounts connected</p>
          )}
          {accounts.map(email => (
            <div key={email} className="flex items-center justify-between">
              <p className="text-xs text-emerald-400 truncate max-w-[200px]">{email}</p>
              <button
                onClick={() => handleDisconnect(email)}
                disabled={disconnecting === email}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 ml-2 shrink-0"
              >
                {disconnecting === email ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
          ))}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <a
            href="/api/auth/google"
            className="inline-block text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-600 rounded-lg px-3 py-1.5 transition-colors"
          >
            + Add Gmail account
          </a>
        </div>
      </div>
    </section>
  )
}
