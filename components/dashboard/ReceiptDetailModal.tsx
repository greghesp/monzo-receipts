'use client'
import { useState } from 'react'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { ParsedReceipt } from '@/lib/types'

interface ReceiptItem { description: string; amount: number; quantity: number }
interface MerchantAddress { address?: string; city?: string; country?: string; postcode?: string }
interface Receipt {
  merchant: string
  total: number
  currency: string
  date: string
  items?: ReceiptItem[]
  merchantDetails?: { email?: string; phone?: string; website?: string; address?: MerchantAddress }
}

function formatAddress(addr?: MerchantAddress): string | null {
  if (!addr) return null
  const parts = [addr.address, addr.city, addr.postcode, addr.country && addr.country !== 'GB' ? addr.country : null]
  return parts.filter(Boolean).join(', ') || null
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted Receipt',
  pending_review: 'Pending Review',
  no_match: 'No Receipt Found',
  skipped: 'Skipped',
}

type LinkState = 'idle' | 'parsing' | 'parsed' | 'submitting' | 'done'

interface Props {
  match: MatchRow
  onClose: () => void
  onSubmitted?: () => void
}

export default function ReceiptDetailModal({ match, onClose, onSubmitted }: Props) {
  const receipt: Receipt | null = match.receipt_data ? JSON.parse(match.receipt_data) : null
  const gmailMessageId = match.external_id?.replace('gmail-', '') ?? null
  const gmailUrl = gmailMessageId ? `https://mail.google.com/mail/u/0/#inbox/${gmailMessageId}` : null
  const txDate = match.transaction_date
    ? new Date(match.transaction_date).toLocaleDateString('en-GB', { dateStyle: 'medium' })
    : null

  const title = STATUS_LABELS[match.status] ?? 'Transaction'
  const canLink = match.status !== 'submitted'

  // Inline manual link state
  const [linkUrl, setLinkUrl] = useState('')
  const [linkState, setLinkState] = useState<LinkState>('idle')
  const [parsedReceipt, setParsedReceipt] = useState<ParsedReceipt | null>(null)
  const [parsedMessageId, setParsedMessageId] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  async function handleFetch() {
    setLinkState('parsing')
    setLinkError(null)
    try {
      const resp = await fetch('/api/manual-match/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.receipt) {
        setLinkError(data.error ?? 'Could not parse a receipt from this email.')
        setLinkState('idle')
        return
      }
      setParsedReceipt(data.receipt)
      setParsedMessageId(data.messageId)
      setLinkState('parsed')
    } catch (e) {
      setLinkError(String(e))
      setLinkState('idle')
    }
  }

  async function handleConfirm() {
    if (!parsedReceipt || !parsedMessageId) return
    setLinkState('submitting')
    setLinkError(null)
    try {
      const transaction = {
        id: match.transaction_id,
        amount: match.amount,
        description: match.merchant,
        created: match.transaction_date ?? new Date().toISOString(),
        merchant: { name: match.merchant, online: !!match.merchant_online },
      }
      const resp = await fetch('/api/manual-match/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction, receipt: parsedReceipt, messageId: parsedMessageId }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        setLinkError(data.error ?? 'Submission failed')
        setLinkState('parsed')
        return
      }
      setLinkState('done')
      onSubmitted?.()
    } catch (e) {
      setLinkError(String(e))
      setLinkState('parsed')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {gmailUrl && (
              <a href={gmailUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                View email ↗
              </a>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Transaction details — always shown */}
          <div className="bg-slate-900 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">Transaction</p>
              <span className="text-xs text-slate-500" title={match.merchant_online ? 'Online purchase' : 'In-store purchase'}>
                {match.merchant_online ? '🌐 Online' : '🏪 In-store'}
              </span>
            </div>
            <p className="text-sm font-medium text-white">{match.merchant}</p>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-300">£{(match.amount / 100).toFixed(2)}</p>
              {txDate && <p className="text-xs text-slate-500">{txDate}</p>}
            </div>
            {match.confidence && (
              <p className="text-xs text-slate-500 pt-0.5">
                Confidence: <span className={match.confidence === 'high' ? 'text-emerald-400' : 'text-amber-400'}>{match.confidence}</span>
              </p>
            )}
          </div>

          {receipt ? (
            <>
              {/* Receipt summary */}
              <div className="bg-slate-900 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Receipt</p>
                <p className="text-sm font-medium text-white">{receipt.merchant}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-sm text-emerald-400">£{(receipt.total / 100).toFixed(2)}</p>
                  {receipt.date && (
                    <p className="text-xs text-slate-500">
                      {new Date(receipt.date).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Line items */}
              {receipt.items && receipt.items.length > 0 && (
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-2">Line items</p>
                  <div className="space-y-1.5">
                    {receipt.items.map((item, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-slate-300 flex-1">
                          {item.quantity > 1 && <span className="text-slate-500 mr-1">{item.quantity}×</span>}
                          {item.description}
                        </span>
                        <span className="text-slate-400 flex-shrink-0">£{(item.amount / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Merchant contact details */}
              {(() => {
                const d = receipt.merchantDetails
                const addr = formatAddress(d?.address)
                if (!d?.email && !d?.website && !d?.phone && !addr) return null
                return (
                  <div className="bg-slate-900 rounded-xl p-3 space-y-1">
                    <p className="text-xs text-slate-500 mb-1">Merchant</p>
                    {addr && <p className="text-xs text-slate-400">{addr}</p>}
                    {d?.email && <p className="text-xs text-slate-400">{d.email}</p>}
                    {d?.phone && <p className="text-xs text-slate-400">{d.phone}</p>}
                    {d?.website && <p className="text-xs text-slate-400">{d.website}</p>}
                  </div>
                )
              })()}
            </>
          ) : (
            <div className="bg-slate-900 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500">No receipt data — no matching email was found for this transaction.</p>
            </div>
          )}

          {/* Inline manual link section */}
          {canLink && (
            <div className="border-t border-slate-700 pt-4 space-y-3">
              <p className="text-xs text-slate-400 font-medium">Link receipt from Gmail</p>

              {linkState === 'done' ? (
                <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-emerald-400">✓ Receipt submitted to Monzo</p>
                </div>
              ) : linkState === 'parsed' && parsedReceipt ? (
                <div className="space-y-2">
                  <div className="bg-slate-900 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Parsed receipt</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white">{parsedReceipt.merchant}</p>
                      <p className="text-sm text-emerald-400">£{(parsedReceipt.total / 100).toFixed(2)}</p>
                    </div>
                    {parsedReceipt.date && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(parsedReceipt.date).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  {linkError && <p className="text-xs text-red-400">{linkError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setLinkState('idle'); setLinkUrl(''); setParsedReceipt(null) }}
                      disabled={linkState === 'submitting'}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-xs rounded-lg py-2 transition-colors"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={linkState === 'submitting'}
                      className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg py-2 transition-colors"
                    >
                      {linkState === 'submitting' ? 'Submitting…' : 'Submit to Monzo'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && linkUrl && linkState === 'idle' && handleFetch()}
                    placeholder="https://mail.google.com/mail/u/0/popout?th=…"
                    disabled={linkState === 'parsing'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                  />
                  {linkError && <p className="text-xs text-red-400">{linkError}</p>}
                  <button
                    onClick={handleFetch}
                    disabled={!linkUrl || linkState === 'parsing'}
                    className="w-full bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg py-2 transition-colors"
                  >
                    {linkState === 'parsing' ? 'Fetching email…' : 'Fetch & Parse Email'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex-shrink-0">
          <button onClick={onClose}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-xl py-2.5 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
