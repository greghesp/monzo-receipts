interface Props { label: string; connected: boolean; onReconnect: () => void }

export default function ConnectionBadge({ label, connected, onReconnect }: Props) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${connected ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      {label}
      {!connected && (
        <button onClick={onReconnect} className="ml-1 text-sky-400 hover:text-sky-300 underline">
          Connect
        </button>
      )}
    </div>
  )
}
