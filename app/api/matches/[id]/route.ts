import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatchById, updateMatchStatus } from '@/lib/db/queries/matches'
import { submitReceipt } from '@/lib/monzo/receipts'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import type { MatchCandidate } from '@/lib/types'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  const id = parseInt(params.id, 10)
  const { action } = await req.json() as { action: 'approve' | 'skip' }
  const match = getMatchById(db, id)
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'skip') {
    updateMatchStatus(db, id, 'skipped')
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    if (!match.receipt_data) return NextResponse.json({ error: 'No receipt data' }, { status: 400 })
    try {
      const accessToken = await getMonzoAccessToken(db, userId)
      const receipt = JSON.parse(match.receipt_data)
      const candidate: MatchCandidate = {
        transaction: { id: match.transaction_id, amount: -match.amount, currency: match.currency, created: new Date(match.matched_at * 1000).toISOString(), merchant: { name: match.merchant }, description: match.merchant },
        email: { messageId: match.external_id?.replace('gmail-', '') ?? '', subject: '', from: '', date: '', html: '', attachments: [] },
        receipt,
        confidence: match.confidence ?? 'medium',
      }
      await submitReceipt(accessToken, candidate)
      updateMatchStatus(db, id, 'submitted')
      return NextResponse.json({ ok: true })
    } catch (e) {
      console.error('[approve] submitReceipt failed:', e)
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
