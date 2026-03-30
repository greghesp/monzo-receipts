import type { MonzoTransaction, ParsedReceipt, Confidence } from '../types'

const ONE_DAY_MS = 86_400_000

export function scoreConfidence(tx: MonzoTransaction, receipt: ParsedReceipt): Confidence | null {
  const txAmount = Math.abs(tx.amount)
  if (txAmount !== receipt.total) return null

  const txDate = new Date(tx.created).getTime()
  const receiptDate = new Date(receipt.date).getTime()
  const diffMs = Math.abs(txDate - receiptDate)

  if (diffMs < ONE_DAY_MS) return 'high'
  if (diffMs <= ONE_DAY_MS * 2) return 'medium'
  return null
}

export function merchantSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = norm(a), nb = norm(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8
  return 0
}
