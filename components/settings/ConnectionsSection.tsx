interface Props { monzoConnected: boolean; googleConnected: boolean }

export default function ConnectionsSection({ monzoConnected, googleConnected }: Props) {
  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Connections</h2>
      <div className="bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-700">
        {[
          { label: 'Monzo', connected: monzoConnected, href: '/api/auth/monzo' },
          { label: 'Gmail', connected: googleConnected, href: '/api/auth/google' },
        ].map(({ label, connected, href }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-white">{label}</p>
              <p className={`text-xs mt-0.5 ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                {connected ? 'Connected' : 'Not connected'}
              </p>
            </div>
            <a href={href} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
              {connected ? 'Reconnect' : 'Connect'}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
