import type { MonzoAccount } from '../types'

const ALLOWED_TYPES = new Set(['uk_retail', 'uk_retail_joint', 'uk_business'])

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  uk_retail: 'Personal',
  uk_retail_joint: 'Joint Account',
  uk_business: 'Business Account',
}

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

/**
 * Returns a human-friendly display name for a Monzo account.
 * - Personal: uses owners[0].preferred_name (e.g. "Greg Hespell")
 * - Joint: joins both owners' preferred names with " & " (e.g. "Greg & Sarah")
 * - Business or fallback: uses description as-is
 */
export function accountDisplayName(account: MonzoAccount): string {
  const owners = account.owners
  if (owners && owners.length > 0) {
    if (account.type === 'uk_retail' && owners.length === 1) {
      return owners[0].preferred_name
    }
    if (account.type === 'uk_retail_joint' && owners.length >= 2) {
      // Use first name only for joint to keep it concise
      const firstName = (name: string) => name.split(' ')[0]
      return `${firstName(owners[0].preferred_name)} & ${firstName(owners[1].preferred_name)}`
    }
  }
  return account.description
}
