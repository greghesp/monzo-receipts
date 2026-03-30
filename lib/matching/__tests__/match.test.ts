import { matchEmailsToTransactions } from '../match'
import type { MonzoTransaction, GmailMessage, ParsedReceipt } from '../../types'

const tx: MonzoTransaction = {
  id: 'tx_1', amount: -2499, currency: 'GBP',
  created: '2026-03-14T10:00:00Z',
  merchant: { name: 'Amazon' }, description: 'Amazon',
}
const email: GmailMessage = {
  messageId: 'msg_1', subject: 'Your Amazon order', from: 'ship-confirm@amazon.co.uk',
  date: '2026-03-14T11:00:00Z', html: '',
}
const receipt: ParsedReceipt = {
  merchant: 'Amazon', total: 2499, currency: 'GBP',
  date: '2026-03-14T11:00:00Z', items: [{ description: 'Headphones', amount: 2499, quantity: 1 }],
}

describe('matchEmailsToTransactions', () => {
  it('returns high confidence match', () => {
    const results = matchEmailsToTransactions([tx], [{ email, receipt }])
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('high')
    expect(results[0].transaction.id).toBe('tx_1')
  })

  it('returns empty when amounts differ', () => {
    const badReceipt = { ...receipt, total: 100 }
    expect(matchEmailsToTransactions([tx], [{ email, receipt: badReceipt }])).toHaveLength(0)
  })

  it('does not double-match — one email per transaction', () => {
    const tx2 = { ...tx, id: 'tx_2' }
    const results = matchEmailsToTransactions([tx, tx2], [{ email, receipt }])
    expect(results).toHaveLength(1)
  })
})
