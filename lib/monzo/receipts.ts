import type { MatchCandidate } from '../types'

export interface ReceiptPayload {
  transaction_id: string
  external_id: string
  total: number
  currency: string
  date: string
  merchant: {
    name: string
    online: boolean
    email?: string
    phone?: string
    website?: string
    category?: string
    address?: { address?: string; city?: string; country?: string; postcode?: string }
  }
  items: Array<{ description: string; amount: number; quantity: number }>
  payments: Array<{ type: string; amount: number; currency: string }>
}

export function buildReceiptPayload(candidate: MatchCandidate): ReceiptPayload {
  const { transaction, email, receipt } = candidate
  const d = receipt.merchantDetails ?? {}
  return {
    transaction_id: transaction.id,
    external_id: `gmail-${email.messageId}`,
    total: receipt.total,
    currency: receipt.currency,
    date: receipt.date,
    merchant: {
      name: receipt.merchant,
      online: true,
      ...(d.email && { email: d.email }),
      ...(d.phone && { phone: d.phone }),
      ...(d.website && { website: d.website }),
      ...(d.address && { address: d.address }),
    },
    items: receipt.items,
    payments: [{ type: 'card', amount: receipt.total, currency: receipt.currency }],
  }
}

export async function submitReceipt(accessToken: string, candidate: MatchCandidate): Promise<void> {
  const payload = buildReceiptPayload(candidate)
  const resp = await fetch('https://api.monzo.com/transaction-receipts', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Receipt submission failed (${resp.status}): ${err}`)
  }
}
