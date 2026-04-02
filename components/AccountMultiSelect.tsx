import { ACCOUNT_TYPE_LABELS } from '@/lib/monzo/accounts'

interface Account { id: string; description: string; displayName?: string; type: string }

interface Props {
  accounts: Account[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export default function AccountMultiSelect({ accounts, selected, onChange }: Props) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700">
      {accounts.map(account => (
        <label
          key={account.id}
          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-700/50 border-b border-slate-700 last:border-0"
        >
          <div
            className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
              selected.includes(account.id) ? 'bg-sky-500' : 'bg-slate-700'
            }`}
            onClick={() => toggle(account.id)}
          >
            {selected.includes(account.id) && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-slate-200 flex-1">{account.displayName ?? account.description}</span>
          <span className="text-xs text-slate-500">{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</span>
        </label>
      ))}
    </div>
  )
}
