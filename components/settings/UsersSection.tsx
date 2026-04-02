// components/settings/UsersSection.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: number
  username: string
  isCurrentUser: boolean
}

export default function UsersSection({ users: initialUsers }: { users: User[] }) {
  const router = useRouter()
  const [users, setUsers] = useState(initialUsers)
  const [removing, setRemoving] = useState<number | null>(null)

  async function handleRemove(id: number) {
    setRemoving(id)
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(u => u.filter(x => x.id !== id))
    setRemoving(null)
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-white">Users</h2>
      <div className="space-y-2">
        {users.map(user => (
          <div key={user.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-300">
                {user.username[0].toUpperCase()}
              </div>
              <span className="text-sm text-white">{user.username}</span>
              {user.isCurrentUser && (
                <span className="text-xs text-slate-500">you</span>
              )}
            </div>
            {!user.isCurrentUser && (
              <button
                onClick={() => handleRemove(user.id)}
                disabled={removing === user.id}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {removing === user.id ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => router.push('/auth/register?mode=add')}
        className="text-xs text-slate-400 hover:text-slate-200 border border-dashed border-slate-600 rounded-lg px-3 py-2 w-full text-left"
      >
        + Add user
      </button>
    </div>
  )
}
