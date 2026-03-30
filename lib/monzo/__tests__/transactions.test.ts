import { filterActiveAccounts } from '../accounts'
import { buildTransactionUrl } from '../transactions'
import type { MonzoAccount } from '../../types'

describe('filterActiveAccounts', () => {
  const accounts: MonzoAccount[] = [
    { id: 'acc_1', type: 'uk_retail', description: 'Personal', closed: false },
    { id: 'acc_2', type: 'uk_prepaid', description: 'Prepaid', closed: false },
    { id: 'acc_3', type: 'uk_retail_joint', description: 'Joint', closed: false },
    { id: 'acc_4', type: 'uk_monzo_flex', description: 'Flex', closed: false },
    { id: 'acc_5', type: 'uk_retail', description: 'Old', closed: true },
  ]

  it('keeps uk_retail, uk_retail_joint, uk_business', () => {
    const result = filterActiveAccounts(accounts)
    expect(result.map(a => a.id)).toEqual(['acc_1', 'acc_3'])
  })
})

describe('buildTransactionUrl', () => {
  it('uses since as ISO string when no cursor', () => {
    const url = buildTransactionUrl('acc_1', '2026-01-01T00:00:00Z', undefined)
    expect(url).toContain('since=2026-01-01T00%3A00%3A00Z')
  })
  it('uses cursor transaction id when provided', () => {
    const url = buildTransactionUrl('acc_1', '2026-01-01T00:00:00Z', 'tx_prev')
    expect(url).toContain('since=tx_prev')
  })
})
