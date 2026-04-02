'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MonzoTransaction, ParsedReceipt, GmailMessage } from '@/lib/types'

type Step = 'url' | 'parsed' | 'pick' | 'confirm' | 'done'

interface ParseResult {
  email: GmailMessage
  receipt: ParsedReceipt | null
  messageId: string
}

export default function ManualMatchPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('url')
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [transactions, setTransactions] = useState<MonzoTransaction[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [txSearch, setTxSearch] = useState('')
  const [selected, setSelected] = useState<MonzoTransaction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleParse() {
    setParsing(true)
    setParseError(null)
    try {
      const resp = await fetch('/api/manual-match/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await resp.json()
      if (!resp.ok) { setParseError(data.error ?? 'Failed to fetch email'); return }
      setParsed(data)
      setStep('parsed')
    } catch (e) {
      setParseError(String(e))
    } finally {
      setParsing(false)
    }
  }

  async function handlePickTransaction() {
    setStep('pick')
    setTxLoading(true)
    try {
      const resp = await fetch('/api/manual-match/transactions')
      const data = await resp.json()
      setTransactions(data.transactions ?? [])
    } finally {
      setTxLoading(false)
    }
  }

  function handleSelectTransaction(tx: MonzoTransaction) {
    setSelected(tx)
    setStep('confirm')
  }

  async function handleSubmit() {
    if (!parsed || !selected) return
    setSubmitting(true)
    setSubmitError(null)
    const receipt = parsed.receipt!
    try {
      const resp = await fetch('/api/manual-match/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: selected, receipt, messageId: parsed.messageId }),
      })
      const data = await resp.json()
      if (!resp.ok) { setSubmitError(data.error ?? 'Submission failed'); return }
      setStep('done')
    } catch (e) {
      setSubmitError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = transactions.filter(tx => {
    if (!txSearch) return true
    const q = txSearch.toLowerCase()
    return (
      (tx.merchant?.name ?? tx.description).toLowerCase().includes(q) ||
      (Math.abs(tx.amount) / 100).toFixed(2).includes(q)
    )
  })

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Dashboard</Link>
          <h1 className="text-lg font-bold text-white">Manual Match</h1>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {(['url', 'parsed', 'pick', 'confirm'] as Step[]).map((s, i) => {
            const labels: Record<string, string> = { url: 'Email URL', parsed: 'Review Receipt', pick: 'Pick Transaction', confirm: 'Confirm' }
            const steps: Step[] = ['url', 'parsed', 'pick', 'confirm']
            const stepIndex = steps.indexOf(step)
            const thisIndex = i
            return (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <span className="text-slate-700">›</span>}
                <span className={thisIndex <= stepIndex ? 'text-sky-400' : 'text-slate-600'}>
                  {labels[s]}
                </span>
              </span>
            )
          })}
        </div>

        {/* Step 1: Paste URL */}
        {step === 'url' && (
          <div className="bg-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-2">Gmail email URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && url && handleParse()}
                placeholder="https://mail.google.com/mail/u/0/#inbox/FMfcgz..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
              <p className="text-xs text-slate-600 mt-1.5">Paste the URL from your browser address bar. For best results, open the email and use <span className="text-slate-500">⋮ → Print</span> — the popout URL contains a reliable message ID.</p>
            </div>
            {parseError && <p className="text-xs text-red-400">{parseError}</p>}
            <button
              onClick={handleParse}
              disabled={parsing || !url}
              className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors"
            >
              {parsing ? 'Fetching email…' : 'Fetch & Parse Email'}
            </button>
          </div>
        )}

        {/* Step 2: Review parsed receipt */}
        {step === 'parsed' && parsed && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-5 space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Email</p>
                <p className="text-sm font-medium text-white truncate">{parsed.email.subject}</p>
                <p className="text-xs text-slate-500">{parsed.email.from}</p>
              </div>

              {parsed.receipt ? (
                <>
                  <div className="border-t border-slate-700 pt-3">
                    <p className="text-xs text-slate-500 mb-2">Parsed receipt</p>
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-white">{parsed.receipt.merchant}</p>
                      <p className="text-sm text-emerald-400">£{(parsed.receipt.total / 100).toFixed(2)}</p>
                    </div>
                    {parsed.receipt.date && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(parsed.receipt.date).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  {parsed.receipt.items?.length > 0 && (
                    <div className="bg-slate-900 rounded-lg p-3 space-y-1.5">
                      {parsed.receipt.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-slate-300 flex-1">
                            {item.quantity > 1 && <span className="text-slate-500 mr-1">{item.quantity}×</span>}
                            {item.description}
                          </span>
                          <span className="text-slate-400">£{(item.amount / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="border-t border-slate-700 pt-3">
                  <p className="text-xs text-amber-400">Could not parse receipt data from this email. You can still continue and manually match it, but the receipt details won't be submitted to Monzo.</p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('url')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg py-2.5 transition-colors">
                ← Back
              </button>
              {parsed.receipt ? (
                <button onClick={handlePickTransaction} className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg py-2.5 transition-colors">
                  Pick Transaction →
                </button>
              ) : (
                <button onClick={() => setStep('url')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg py-2.5 transition-colors">
                  Try another URL
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Pick transaction */}
        {step === 'pick' && (
          <div className="bg-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <p className="text-sm font-semibold text-white mb-3">Select transaction</p>
              <input
                type="text"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Search by merchant or amount…"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500"
                autoFocus
              />
            </div>

            <div className="divide-y divide-slate-700/50 max-h-96 overflow-y-auto">
              {txLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading transactions…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No transactions found</div>
              ) : (
                filtered.map(tx => (
                  <button
                    key={tx.id}
                    onClick={() => handleSelectTransaction(tx)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 text-left transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{tx.merchant?.name ?? tx.description}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(tx.created).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                        {tx.merchant?.online ? ' · 🌐' : ' · 🏪'}
                      </p>
                    </div>
                    <p className="text-sm text-slate-300 flex-shrink-0">£{(Math.abs(tx.amount) / 100).toFixed(2)}</p>
                  </button>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-700">
              <button onClick={() => setStep('parsed')} className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Back
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && parsed && selected && (
          <div className="space-y-3">
            <div className="bg-slate-800 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-white">Confirm match</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Transaction</p>
                  <p className="text-sm font-medium text-white truncate">{selected.merchant?.name ?? selected.description}</p>
                  <p className="text-sm text-slate-300">£{(Math.abs(selected.amount) / 100).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(selected.created).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">Receipt</p>
                  <p className="text-sm font-medium text-white truncate">{parsed.receipt!.merchant}</p>
                  <p className="text-sm text-emerald-400">£{(parsed.receipt!.total / 100).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(parsed.receipt!.date).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                  </p>
                </div>
              </div>

              {parsed.receipt!.items?.length > 0 && (
                <div className="bg-slate-900 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-2">Line items</p>
                  <div className="space-y-1.5">
                    {parsed.receipt!.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-slate-300 flex-1">
                          {item.quantity > 1 && <span className="text-slate-500 mr-1">{item.quantity}×</span>}
                          {item.description}
                        </span>
                        <span className="text-slate-400">£{(item.amount / 100).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submitError && <p className="text-xs text-red-400">{submitError}</p>}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('pick')} disabled={submitting} className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm rounded-lg py-2.5 transition-colors">
                ← Back
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5 transition-colors">
                {submitting ? 'Submitting…' : 'Submit to Monzo'}
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className="bg-slate-800 rounded-xl p-8 text-center space-y-4">
            <div className="text-4xl">✓</div>
            <div>
              <p className="text-sm font-semibold text-white">Receipt submitted</p>
              <p className="text-xs text-slate-500 mt-1">The receipt has been added to your Monzo transaction.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('url'); setUrl(''); setParsed(null); setSelected(null) }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg py-2.5 transition-colors"
              >
                Match another
              </button>
              <Link href="/" className="flex-1 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg py-2.5 transition-colors text-center">
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
