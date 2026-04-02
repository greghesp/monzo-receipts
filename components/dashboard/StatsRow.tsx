interface Props { total: number; submitted: number; pendingReview: number; noMatch: number }

export default function StatsRow({ total, submitted, pendingReview, noMatch }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Transactions', value: total, color: 'text-white' },
        { label: 'Matched', value: submitted, color: 'text-emerald-400' },
        { label: 'Needs Review', value: pendingReview, color: 'text-amber-400' },
        { label: 'No Receipt', value: noMatch, color: 'text-slate-500' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-slate-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-slate-500 mt-1">{label}</div>
        </div>
      ))}
    </div>
  )
}
