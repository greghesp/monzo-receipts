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

  it('returns medium confidence match when no high-confidence transaction available', () => {
    // Receipt date is 1.5 days after transaction — medium confidence
    const mediumReceipt: ParsedReceipt = { ...receipt, date: '2026-03-15T22:00:00Z' }
    const results = matchEmailsToTransactions([tx], [{ email, receipt: mediumReceipt }])
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('medium')
  })

  it('prefers high confidence over medium when multiple transactions match', () => {
    // tx matches with high confidence (same day)
    // tx_near matches with medium confidence (1.5 days later)
    const txNear: MonzoTransaction = { ...tx, id: 'tx_near', created: '2026-03-15T22:00:00Z' }
    const results = matchEmailsToTransactions([txNear, tx], [{ email, receipt }])
    expect(results).toHaveLength(1)
    expect(results[0].transaction.id).toBe('tx_1')
    expect(results[0].confidence).toBe('high')
  })

  it('matches multiple emails to different transactions', () => {
    const tx2: MonzoTransaction = { ...tx, id: 'tx_2', amount: -999 }
    const email2: GmailMessage = { ...email, messageId: 'msg_2' }
    const receipt2: ParsedReceipt = { ...receipt, total: 999 }
    const results = matchEmailsToTransactions(
      [tx, tx2],
      [{ email, receipt }, { email: email2, receipt: receipt2 }]
    )
    expect(results).toHaveLength(2)
    const ids = results.map(r => r.transaction.id).sort()
    expect(ids).toEqual(['tx_1', 'tx_2'])
  })

  it('returns empty when no transactions provided', () => {
    expect(matchEmailsToTransactions([], [{ email, receipt }])).toHaveLength(0)
  })

  it('returns empty when no emails provided', () => {
    expect(matchEmailsToTransactions([tx], [])).toHaveLength(0)
  })
})
