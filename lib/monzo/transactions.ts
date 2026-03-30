import type { MonzoTransaction } from '../types'

export function buildTransactionUrl(accountId: string, sinceIso: string, cursor: string | undefined): string {
  const since = cursor ?? sinceIso
  return `https://api.monzo.com/transactions?account_id=${accountId}&since=${encodeURIComponent(since)}&expand[]=merchant&limit=100`
}

export async function fetchTransactionsSince(
  accessToken: string,
  accountId: string,
  since: string,
  cursor?: string
): Promise<MonzoTransaction[]> {
  const all: MonzoTransaction[] = []
  let currentCursor = cursor

  while (true) {
    const url = buildTransactionUrl(accountId, since, currentCursor)
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!resp.ok) throw new Error(`Failed to fetch transactions: ${resp.status}`)
    const { transactions } = await resp.json() as { transactions: MonzoTransaction[] }
    all.push(...transactions)
    if (transactions.length < 100) break
    currentCursor = transactions[transactions.length - 1].id
  }

  return all.filter(t => t.amount < 0)
}
