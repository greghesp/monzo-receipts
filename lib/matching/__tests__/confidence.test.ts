import { scoreConfidence, merchantSimilarity } from '../confidence'
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

describe('merchantSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(merchantSimilarity('Amazon', 'Amazon')).toBe(1)
  })

  it('returns 1 for names that differ only by case and punctuation', () => {
    // Both normalise to 'johnssons' after stripping non-alphanumeric
    expect(merchantSimilarity("John's Sons", 'Johns Sons')).toBe(1)
  })

  it('returns 0.8 when one name contains the other', () => {
    expect(merchantSimilarity('Amazon UK', 'Amazon')).toBe(0.8)
  })

  it('returns 0.8 when shorter name is a substring of the longer', () => {
    expect(merchantSimilarity('Netflix', 'Netflix Premium')).toBe(0.8)
  })

  it('returns 0 for completely different names', () => {
    expect(merchantSimilarity('Amazon', 'Tesco')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(merchantSimilarity('AMAZON', 'amazon')).toBe(1)
  })
})
