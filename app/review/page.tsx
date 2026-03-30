'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReviewModal from '@/components/review/ReviewModal'
import type { MatchRow } from '@/lib/db/queries/matches'

export default function ReviewPage() {
  const router = useRouter()
  const [pending, setPending] = useState<MatchRow[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/matches?limit=100')
      .then(r => r.json())
      .then(d => {
        setPending((d.matches as MatchRow[]).filter(m => m.status === 'pending_review'))
        setLoading(false)
      })
  }, [])

  async function handleApprove(id: number) {
    await fetch(`/api/matches/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
    advance()
  }

  async function handleSkip(id: number) {
    await fetch(`/api/matches/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'skip' }) })
    advance()
  }

  function advance() {
    if (index + 1 >= pending.length) router.push('/')
    else setIndex(i => i + 1)
  }

  if (loading) return <main className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400">Loading…</p></main>
  if (pending.length === 0) return <main className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400">No matches to review. <a href="/" className="text-sky-400 underline">Back to dashboard</a></p></main>

  return (
    <main className="min-h-screen bg-slate-950">
      <ReviewModal
        match={pending[index]}
        total={pending.length}
        current={index + 1}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
    </main>
  )
}
