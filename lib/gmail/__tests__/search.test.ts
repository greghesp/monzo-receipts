import { buildGmailQuery } from '../search'

describe('buildGmailQuery', () => {
  it('builds query with after date', () => {
    const q = buildGmailQuery('2026-03-01T00:00:00Z')
    expect(q).toContain('after:2026/03/01')
    expect(q).toContain('subject:(order OR receipt OR confirmation OR invoice)')
  })
})
