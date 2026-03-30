import db from './db'
import { getConfig } from './db/queries/config'
import { getLastSuccessfulRun, createRun, updateRun } from './db/queries/runs'
import { getMatchByTransactionId, upsertMatch } from './db/queries/matches'
import { getMonzoAccessToken, getGoogleAccessToken } from './token-refresh'
import { fetchTransactionsSince } from './monzo/transactions'
import { searchReceipts, readEmail } from './gmail/search'
import { extractJsonLdOrder } from './parsing/jsonld'
import { parseEmailWithClaude } from './parsing/claude'
import { matchEmailsToTransactions } from './matching/match'
import { submitReceipt } from './monzo/receipts'
import { notify } from './notifications'
import type { GmailMessage, ParsedReceipt } from './types'

export type SseEvent =
  | { type: 'start'; transactionCount: number }
  | { type: 'progress'; transactionId: string; status: 'submitted' | 'pending_review' | 'no_match' | 'skipped'; merchant: string; amount: number }
  | { type: 'done'; matched: number; needsReview: number; noMatch: number; skipped: number }
  | { type: 'error'; message: string }

export async function runMatch(
  accountIds: string[],
  emit: (event: SseEvent) => void
): Promise<void> {
  const runId = createRun(db)
  const lookbackDays = parseInt(getConfig(db, 'lookback_days') ?? '30', 10)
  const sinceDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const lastRun = getLastSuccessfulRun(db)
  const cursor = lastRun?.cursor_transaction_id ?? undefined

  let matched = 0, needsReview = 0, noMatch = 0, skipped = 0
  let lastTransactionId: string | null = null

  try {
    const monzoToken = await getMonzoAccessToken(db)
    const googleToken = await getGoogleAccessToken(db)

    const allTransactions = (
      await Promise.all(accountIds.map(id => fetchTransactionsSince(monzoToken, id, sinceDate, cursor)))
    ).flat()

    const newTransactions = allTransactions.filter(tx => {
      const existing = getMatchByTransactionId(db, tx.id)
      return !existing || existing.status === 'pending_review'
    })

    emit({ type: 'start', transactionCount: newTransactions.length })

    if (newTransactions.length === 0) {
      updateRun(db, runId, { status: 'done', transactions_scanned: 0, matched: 0, needs_review: 0, no_match: 0 })
      emit({ type: 'done', matched: 0, needsReview: 0, noMatch: 0, skipped: 0 })
      return
    }

    lastTransactionId = newTransactions[newTransactions.length - 1].id

    const earliest = newTransactions.reduce((min, tx) => tx.created < min ? tx.created : min, newTransactions[0].created)
    const messageIds = await searchReceipts(googleToken, earliest)

    const emailsWithReceipts: { email: GmailMessage; receipt: ParsedReceipt }[] = []
    for (const msgId of messageIds) {
      try {
        const email = await readEmail(googleToken, msgId)
        const receipt = extractJsonLdOrder(email.html) ?? await parseEmailWithClaude(email.subject, email.html, email.from)
        if (receipt) emailsWithReceipts.push({ email, receipt })
      } catch {
        // Skip unreadable emails
      }
    }

    const candidates = matchEmailsToTransactions(newTransactions, emailsWithReceipts)
    const matchedTransactionIds = new Set(candidates.map(c => c.transaction.id))

    for (const candidate of candidates) {
      if (candidate.confidence === 'high') {
        try {
          await submitReceipt(monzoToken, candidate)
          upsertMatch(db, {
            transaction_id: candidate.transaction.id,
            external_id: `gmail-${candidate.email.messageId}`,
            merchant: candidate.receipt.merchant,
            amount: candidate.receipt.total,
            currency: candidate.receipt.currency,
            status: 'submitted',
            confidence: 'high',
            receipt_data: JSON.stringify(candidate.receipt),
          })
          matched++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'submitted', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        } catch {
          upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'high', receipt_data: JSON.stringify(candidate.receipt) })
          needsReview++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        }
      } else {
        upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'medium', receipt_data: JSON.stringify(candidate.receipt) })
        needsReview++
        emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
      }
    }

    for (const tx of newTransactions) {
      if (!matchedTransactionIds.has(tx.id)) {
        const existing = getMatchByTransactionId(db, tx.id)
        if (!existing) {
          upsertMatch(db, { transaction_id: tx.id, external_id: null, merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount), currency: tx.currency, status: 'no_match', confidence: null, receipt_data: null })
          noMatch++
          emit({ type: 'progress', transactionId: tx.id, status: 'no_match', merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount) })
        } else {
          skipped++
          emit({ type: 'progress', transactionId: tx.id, status: 'skipped', merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount) })
        }
      }
    }

    updateRun(db, runId, { status: 'done', cursor_transaction_id: lastTransactionId, transactions_scanned: newTransactions.length, matched, needs_review: needsReview, no_match: noMatch })
    emit({ type: 'done', matched, needsReview, noMatch, skipped })

    await notify(`Monzo receipts: ${matched} matched, ${needsReview} need review, ${noMatch} no match`)
    if (needsReview > 0) {
      await notify(`${needsReview} receipt${needsReview > 1 ? 's' : ''} need review — http://localhost:3000/review`)
    }
  } catch (e) {
    updateRun(db, runId, { status: 'error', error_message: String(e) })
    emit({ type: 'error', message: String(e) })
    await notify(`Receipt matching failed: ${String(e)}`)
  }
}
