import type { MonzoTransaction, GmailMessage, ParsedReceipt, MatchCandidate } from '../types'
import { scoreConfidence } from './confidence'

export interface EmailWithReceipt {
  email: GmailMessage
  receipt: ParsedReceipt
}

export function matchEmailsToTransactions(
  transactions: MonzoTransaction[],
  emailsWithReceipts: EmailWithReceipt[]
): MatchCandidate[] {
  const results: MatchCandidate[] = []
  const usedTransactionIds = new Set<string>()

  for (const { email, receipt } of emailsWithReceipts) {
    let bestMatch: { tx: MonzoTransaction; confidence: 'high' | 'medium' } | null = null

    for (const tx of transactions) {
      if (usedTransactionIds.has(tx.id)) continue
      const confidence = scoreConfidence(tx, receipt)
      if (!confidence) continue
      if (!bestMatch || (confidence === 'high' && bestMatch.confidence === 'medium')) {
        bestMatch = { tx, confidence }
      }
    }

    if (bestMatch) {
      usedTransactionIds.add(bestMatch.tx.id)
      results.push({ transaction: bestMatch.tx as MonzoTransaction & { merchant: NonNullable<MonzoTransaction['merchant']> }, email, receipt, confidence: bestMatch.confidence })
    }
  }

  return results
}
