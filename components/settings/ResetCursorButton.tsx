'use client'
import { useState } from 'react'

export default function ResetCursorButton() {
  const [state, setState] = useState<'idle' | 'confirming' | 'loading' | 'done'>('idle')

  async function handleReset() {
    setState('loading')
    await fetch('/api/reset-cursor', { method: 'POST' })
    setState('done')
    setTimeout(() => setState('idle'), 3000)
  }

  if (state === 'confirming') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Clear all run history and the cursor?</span>
        <button
          onClick={handleReset}
          className="text-xs bg-red-600 hover:bg-red-500 text-white rounded px-2.5 py-1 transition-colors"
        >
          Yes, clear
        </button>
        <button
          onClick={() => setState('idle')}
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (state === 'loading') {
    return <span className="text-xs text-slate-500">Clearing…</span>
  }

  if (state === 'done') {
    return <span className="text-xs text-green-400">✓ Cleared — next run will start fresh</span>
  }

  return (
    <button
      onClick={() => setState('confirming')}
      className="text-xs text-slate-400 hover:text-red-400 transition-colors underline underline-offset-2"
    >
      Reset cursor &amp; history
    </button>
  )
}
