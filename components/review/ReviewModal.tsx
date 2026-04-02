'use client'
import { useState } from 'react'
import type { MatchRow } from '@/lib/db/queries/matches'

interface Props {
  match: MatchRow
  total: number
  current: number
  onApprove: (id: number) => Promise<void>
  onSkip: (id: number) => Promise<void>
}

export default function ReviewModal({ match, total, current, onApprove, onSkip }: Props) {
  const [acting, setActing] = useState<'approve' | 'skip' | null>(null)
  const receipt = match.receipt_data ? JSON.parse(match.receipt_data) : null

  async function handle(action: 'approve' | 'skip') {
    setActing(action)
    if (action === 'approve') await onApprove(match.id)
    else await onSkip(match.id)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Review Match</h2>
          <span className="text-xs text-slate-500">{current} of {total}</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Transaction</p>
              <p className="text-sm font-medium text-white">{match.merchant}</p>
              <p className="text-sm text-amber-400">£{(match.amount / 100).toFixed(2)}</p>
              <p className="text-xs text-slate-500 mt-1">{new Date(match.matched_at * 1000).toLocaleDateString('en-GB')}</p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Email receipt</p>
              {receipt ? (
                <>
                  <p className="text-sm font-medium text-white">{receipt.merchant}</p>
                  <p className="text-sm text-amber-400">£{(receipt.total / 100).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(receipt.date).toLocaleDateString('en-GB')}</p>
                </>
              ) : <p className="text-xs text-slate-500">No receipt data</p>}
            </div>
          </div>
          {receipt?.items?.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Line items</p>
              <div className="space-y-1">
                {receipt.items.map((item: { description: string; amount: number; quantity: number }, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-300">{item.description}</span>
                    <span className="text-slate-400">£{(item.amount / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Confidence: <span className="text-amber-400">{match.confidence}</span>
            {match.confidence === 'medium' && ' — date offset or merchant name mismatch'}
          </p>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={() => handle('skip')}
            disabled={!!acting}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm font-medium rounded-xl py-2.5 transition-colors"
          >
            {acting === 'skip' ? 'Skipping…' : 'Skip'}
          </button>
          <button
            onClick={() => handle('approve')}
            disabled={!!acting}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl py-2.5 transition-colors"
          >
            {acting === 'approve' ? 'Submitting…' : 'Approve & Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
