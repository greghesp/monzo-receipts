import { scoreConfidence } from '../confidence'
import type { MonzoTransaction, ParsedReceipt } from '../../types'

const tx: MonzoTransaction = {
  id: 'tx_1', amount: -2499, currency: 'GBP',
  created: '2026-03-14T10:00:00Z',
  merchant: { name: 'Amazon' }, description: 'Amazon',
}
const receipt: ParsedReceipt = {
  merchant: 'Amazon', total: 2499, currency: 'GBP',
  date: '2026-03-14T10:00:00Z', items: [],
}

describe('scoreConfidence', () => {
  it('HIGH when amount matches and date within 1 day', () => {
    expect(scoreConfidence(tx, receipt)).toBe('high')
  })

  it('MEDIUM when amount matches but date offset is 1 day', () => {
    const r = { ...receipt, date: '2026-03-15T10:00:00Z' }
    expect(scoreConfidence(tx, r)).toBe('medium')
  })

  it('null when amount does not match', () => {
    const r = { ...receipt, total: 999 }
    expect(scoreConfidence(tx, r)).toBeNull()
  })

  it('null when date offset > 1 day', () => {
    const r = { ...receipt, date: '2026-03-18T10:00:00Z' }
    expect(scoreConfidence(tx, r)).toBeNull()
  })

  it('handles negative tx amount correctly (debits are negative)', () => {
    const debit = { ...tx, amount: -999 }
    const r = { ...receipt, total: 999 }
    expect(scoreConfidence(debit, r)).toBe('high')
  })
})
