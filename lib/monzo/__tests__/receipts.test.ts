import { buildReceiptPayload } from '../receipts'
import type { MatchCandidate } from '../../types'

const candidate: MatchCandidate = {
  transaction: { id: 'tx_1', amount: -2499, currency: 'GBP', created: '2026-03-14T10:00:00Z', merchant: { name: 'Amazon' }, description: 'Amazon' },
  email: { messageId: 'msg_abc', subject: 'Order', from: 'ship@amazon.co.uk', date: '2026-03-14T10:00:00Z', html: '' },
  receipt: {
    merchant: 'Amazon', total: 2499, currency: 'GBP', date: '2026-03-14T10:00:00Z',
    items: [{ description: 'Headphones', amount: 2499, quantity: 1 }],
    merchantDetails: { email: 'help@amazon.co.uk', website: 'https://amazon.co.uk' },
  },
  confidence: 'high',
}

describe('buildReceiptPayload', () => {
  it('sets transaction_id and external_id correctly', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.transaction_id).toBe('tx_1')
    expect(p.external_id).toBe('gmail-msg_abc')
  })

  it('sets total in pence', () => {
    expect(buildReceiptPayload(candidate).total).toBe(2499)
  })

  it('includes items', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.items).toHaveLength(1)
    expect(p.items[0].description).toBe('Headphones')
  })

  it('includes merchant details', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.merchant.email).toBe('help@amazon.co.uk')
  })
})
