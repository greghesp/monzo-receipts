import type { MonzoAccount } from '../types'

const ALLOWED_TYPES = new Set(['uk_retail', 'uk_retail_joint', 'uk_business'])

export async function fetchAccounts(accessToken: string): Promise<MonzoAccount[]> {
  const resp = await fetch('https://api.monzo.com/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) throw new Error(`Failed to fetch accounts: ${resp.status}`)
  const { accounts } = await resp.json() as { accounts: MonzoAccount[] }
  return filterActiveAccounts(accounts)
}

export function filterActiveAccounts(accounts: MonzoAccount[]): MonzoAccount[] {
  return accounts.filter(a => ALLOWED_TYPES.has(a.type) && !a.closed)
}
