import db from './db'
import { getConfig } from './db/queries/config'
import { getLastSuccessfulRun, createRun, updateRun } from './db/queries/runs'
import { getMatchByTransactionId, upsertMatch } from './db/queries/matches'
import { getMonzoAccessToken, getAllGoogleAccessTokens, forceRefreshMonzoToken } from './token-refresh'
import { fetchTransactionsSince, pingWhoAmI } from './monzo/transactions'
import { searchReceipts, readEmail } from './gmail/search'
import { findAttachments, pickBestAttachment, downloadGmailAttachment } from './gmail/attachments'
import { extractJsonLdOrder } from './parsing/jsonld'
import { parseEmailWithClaude } from './parsing/claude'
import { parseReceiptFromPdf } from './parsing/pdf'
import { google } from 'googleapis'
import { matchEmailsToTransactions } from './matching/match'
import { scoreConfidence } from './matching/confidence'
import { submitReceipt } from './monzo/receipts'
import { notify } from './notifications'
import { buildGmailQuery } from './gmail/search'
import type { GmailMessage, ParsedReceipt } from './types'

export type SseEvent =
  | { type: 'start'; transactionCount: number }
  | { type: 'scanning'; emailsFound: number; emailsProcessed: number }
  | { type: 'progress'; transactionId: string; status: 'submitted' | 'pending_review' | 'no_match' | 'skipped'; merchant: string; amount: number }
  | { type: 'done'; matched: number; needsReview: number; noMatch: number; skipped: number }
  | { type: 'error'; message: string }

export interface RunOptions {
  lookbackDays?: number
  onlyOnline?: boolean
}

export async function runMatch(
  userId: number,
  accountIds: string[],
  emit: (event: SseEvent) => void,
  options?: RunOptions
): Promise<void> {
  const runId = createRun(db, userId)
  const lookbackDays = options?.lookbackDays ?? parseInt(getConfig(db, 'lookback_days', userId) ?? '30', 10)
  const sinceDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const lastRun = getLastSuccessfulRun(db, userId)
  const cursor = lastRun?.cursor_transaction_id ?? undefined

  let matched = 0, needsReview = 0, noMatch = 0, skipped = 0
  let lastTransactionId: string | null = null

  try {
    let monzoToken = await getMonzoAccessToken(db, userId)

    // Validate the token is genuinely accepted by Monzo before starting the run.
    // If it fails whoami, force-refresh now rather than discovering it mid-run.
    const tokenValid = await pingWhoAmI(monzoToken)
    if (!tokenValid) {
      console.log('[runner] whoami check failed — force-refreshing Monzo token')
      try {
        monzoToken = await forceRefreshMonzoToken(db, userId)
      } catch {
        throw new Error('MONZO_REAUTH_REQUIRED')
      }
    }

    const fetchWithRetry = async (accountId: string) => {
      try {
        return await fetchTransactionsSince(monzoToken, accountId, sinceDate, cursor)
      } catch (e) {
        if ((e as Error).message !== 'MONZO_TOKEN_REJECTED') throw e
        // Token was rejected mid-run — try a force-refresh once then retry
        console.log('[runner] token rejected mid-run — force-refreshing and retrying')
        try {
          monzoToken = await forceRefreshMonzoToken(db, userId)
        } catch {
          throw new Error('MONZO_REAUTH_REQUIRED')
        }
        try {
          return await fetchTransactionsSince(monzoToken, accountId, sinceDate, cursor)
        } catch (e2) {
          if ((e2 as Error).message === 'MONZO_TOKEN_REJECTED') throw new Error('MONZO_REAUTH_REQUIRED')
          throw e2
        }
      }
    }

    const allTransactions = (
      await Promise.all(
        accountIds.map(async (accountId) => {
          const txs = await fetchWithRetry(accountId)
          return txs.map(tx => ({ ...tx, _accountId: accountId }))
        })
      )
    ).flat()

    const onlyOnline = options?.onlyOnline ?? (getConfig(db, 'only_online_transactions', userId) === 'true')

    const newTransactions = allTransactions.filter(tx => {
      if (onlyOnline && !tx.merchant?.online) return false
      const existing = getMatchByTransactionId(db, tx.id)
      return !existing || existing.status === 'pending_review'
    })

    console.log(`[runner] ${newTransactions.length} transactions to process`)
    newTransactions.forEach(tx => {
      console.log(`[runner]   tx ${tx.id} — ${tx.merchant?.name ?? tx.description} ${Math.abs(tx.amount)}p ${tx.created}`)
    })

    emit({ type: 'start', transactionCount: newTransactions.length })

    if (newTransactions.length === 0) {
      updateRun(db, runId, { status: 'done', transactions_scanned: 0, matched: 0, needs_review: 0, no_match: 0 })
      emit({ type: 'done', matched: 0, needsReview: 0, noMatch: 0, skipped: 0 })
      return
    }

    lastTransactionId = newTransactions[newTransactions.length - 1].id

    const earliest = newTransactions.reduce((min, tx) => tx.created < min ? tx.created : min, newTransactions[0].created)
    const gmailQuery = buildGmailQuery(earliest)
    console.log(`[runner] Gmail search query: ${gmailQuery}`)

    const googleAccounts = await getAllGoogleAccessTokens(db, userId)
    if (googleAccounts.length === 0) throw new Error('Gmail not connected')

    // Search all connected Gmail inboxes; pair each message ID with its source token.
    // Use allSettled so a single bad token doesn't abort the entire run.
    type MessageRef = { id: string; accessToken: string }
    const searchResults = await Promise.allSettled(
      googleAccounts.map(async ({ email: gmailEmail, accessToken }) => {
        const ids = await searchReceipts(accessToken, earliest)
        console.log(`[runner] Gmail ${gmailEmail}: ${ids.length} message(s)`)
        return ids.map(id => ({ id, accessToken }))
      })
    )
    const allMessageRefs: MessageRef[] = searchResults.flatMap(r => {
      if (r.status === 'fulfilled') return r.value
      console.error(`[runner] Gmail search failed for one account — skipping:`, r.reason)
      return []
    })

    // Deduplicate by message ID (safety — same message shouldn't appear in two accounts)
    const seen = new Set<string>()
    const messageRefs: MessageRef[] = []
    for (const ref of allMessageRefs) {
      if (!seen.has(ref.id)) { seen.add(ref.id); messageRefs.push(ref) }
    }

    emit({ type: 'scanning', emailsFound: messageRefs.length, emailsProcessed: 0 })
    const emailsWithReceipts: { email: GmailMessage; receipt: ParsedReceipt }[] = []
    for (let i = 0; i < messageRefs.length; i++) {
      const { id: msgId, accessToken } = messageRefs[i]
      try {
        const email = await readEmail(accessToken, msgId)
        console.log(`[runner] Email: "${email.subject}" from ${email.from} date=${email.date}`)
        const jsonLd = extractJsonLdOrder(email.html, email.date)
        if (jsonLd) {
          console.log(`[runner]   → JSON-LD found: merchant="${jsonLd.merchant}" total=${jsonLd.total}p date=${jsonLd.date}`)
          emailsWithReceipts.push({ email, receipt: jsonLd })
        } else {
          console.log(`[runner]   → No JSON-LD, trying AI on email body...`)
          const ai = await parseEmailWithClaude(email.subject, email.html, email.from, email.date)
          // AI may return total=0 when the email body has no financial data (e.g. "see attached PDF").
          // Treat zero-total the same as null — try the PDF attachment as fallback.
          const aiUsable = ai && ai.total > 0
          if (aiUsable) {
            console.log(`[runner]   → AI parsed: merchant="${ai.merchant}" total=${ai.total}p date=${ai.date}`)
            emailsWithReceipts.push({ email, receipt: ai })
          } else {
            // Last resort: try parsing any PDF invoice attachment
            const pdfs = email.attachments.filter(a => a.mimeType === 'application/pdf')
            const bestPdf = pickBestAttachment(pdfs)
            if (bestPdf) {
              console.log(`[runner]   → ${ai ? 'AI returned zero total' : 'AI returned null'} — trying PDF attachment: "${bestPdf.filename}"`)
              try {
                const auth = new google.auth.OAuth2()
                auth.setCredentials({ access_token: accessToken })
                const gmail = google.gmail({ version: 'v1', auth })
                const pdfBuffer = await downloadGmailAttachment(gmail, msgId, bestPdf.attachmentId)
                const pdfReceipt = await parseReceiptFromPdf(pdfBuffer, bestPdf.filename)
                if (pdfReceipt && pdfReceipt.total > 0) {
                  console.log(`[runner]   → PDF parsed: merchant="${pdfReceipt.merchant}" total=${pdfReceipt.total}p date=${pdfReceipt.date}`)
                  emailsWithReceipts.push({ email, receipt: pdfReceipt })
                } else {
                  console.log(`[runner]   → PDF parse returned null/zero — email will not be matched`)
                }
              } catch (e) {
                console.log(`[runner]   → PDF download/parse error: ${e}`)
              }
            } else {
              console.log(`[runner]   → ${ai ? 'AI returned zero total' : 'AI returned null'}, no PDF attachments — email will not be matched`)
            }
          }
        }
      } catch (e) {
        console.log(`[runner]   → Error reading email ${msgId}: ${e}`)
      }
      emit({ type: 'scanning', emailsFound: messageRefs.length, emailsProcessed: i + 1 })
    }

    console.log(`[runner] ${emailsWithReceipts.length} email(s) with parsed receipts`)

    // Log why each transaction matched or didn't
    for (const tx of newTransactions) {
      const txAmount = Math.abs(tx.amount)
      const amountMatches = emailsWithReceipts.filter(e => e.receipt.total === txAmount)
      if (amountMatches.length === 0) {
        const closest = emailsWithReceipts.map(e => e.receipt.total).join(', ')
        console.log(`[matcher] tx ${tx.merchant?.name ?? tx.description} ${txAmount}p — no amount match (email totals: ${closest || 'none'})`)
      } else {
        amountMatches.forEach(e => {
          const conf = scoreConfidence(tx, e.receipt)
          console.log(`[matcher] tx ${tx.merchant?.name ?? tx.description} ${txAmount}p ↔ "${e.receipt.merchant}" ${e.receipt.total}p — confidence: ${conf ?? 'null (date too far)'} tx_date=${tx.created} receipt_date=${e.receipt.date}`)
        })
      }
    }

    const candidates = matchEmailsToTransactions(newTransactions, emailsWithReceipts)
    console.log(`[runner] ${candidates.length} match candidate(s)`)
    const matchedTransactionIds = new Set(candidates.map(c => c.transaction.id))

    for (const candidate of candidates) {
      const txDate = candidate.transaction.created
      const txOnline = candidate.transaction.merchant?.online ?? false
      const txAccountId = (candidate.transaction as any)._accountId ?? null
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
            transaction_date: txDate,
            merchant_online: txOnline,
            account_id: txAccountId,
          })
          matched++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'submitted', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        } catch {
          upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'high', receipt_data: JSON.stringify(candidate.receipt), transaction_date: txDate, merchant_online: txOnline, account_id: txAccountId })
          needsReview++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        }
      } else {
        upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'medium', receipt_data: JSON.stringify(candidate.receipt), transaction_date: txDate, merchant_online: txOnline, account_id: txAccountId })
        needsReview++
        emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
      }
    }

    for (const tx of newTransactions) {
      if (!matchedTransactionIds.has(tx.id)) {
        const txAccountId = (tx as any)._accountId ?? null
        const existing = getMatchByTransactionId(db, tx.id)
        if (!existing) {
          upsertMatch(db, { transaction_id: tx.id, external_id: null, merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount), currency: tx.currency, status: 'no_match', confidence: null, receipt_data: null, transaction_date: tx.created, merchant_online: tx.merchant?.online ?? false, account_id: txAccountId })
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
