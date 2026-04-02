import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import { submitReceipt } from '@/lib/monzo/receipts'
import { upsertMatch } from '@/lib/db/queries/matches'
import type { MatchCandidate, MonzoTransaction, ParsedReceipt, GmailMessage } from '@/lib/types'

export async function POST(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  const { transaction, receipt, messageId } = await req.json() as {
    transaction: MonzoTransaction
    receipt: ParsedReceipt
    messageId: string
  }

  if (!transaction || !receipt || !messageId) {
    return NextResponse.json({ error: 'transaction, receipt and messageId required' }, { status: 400 })
  }

  try {
    const monzoToken = await getMonzoAccessToken(db, userId)

    // Build a minimal GmailMessage stub — only messageId is needed for the external_id
    const email: GmailMessage = {
      messageId,
      subject: '',
      from: '',
      date: receipt.date,
      html: '',
      attachments: [],
    }

    const candidate: MatchCandidate = {
      transaction: { ...transaction, merchant: transaction.merchant ?? { name: receipt.merchant } },
      email,
      receipt,
      confidence: 'high',
    }

    await submitReceipt(monzoToken, candidate)

    upsertMatch(db, {
      transaction_id: transaction.id,
      external_id: `gmail-${messageId}`,
      merchant: receipt.merchant,
      amount: receipt.total,
      currency: receipt.currency,
      status: 'submitted',
      confidence: 'high',
      receipt_data: JSON.stringify(receipt),
      transaction_date: transaction.created,
      merchant_online: transaction.merchant?.online ?? false,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
