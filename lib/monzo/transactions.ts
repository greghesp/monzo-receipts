import type { MonzoTransaction } from '../types'

export async function pingWhoAmI(accessToken: string): Promise<boolean> {
  const resp = await fetch('https://api.monzo.com/ping/whoami', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return resp.ok
}

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
    if (!resp.ok) {
      const body = await resp.text().catch(() => '(no body)')
      try {
        const json = JSON.parse(body)
        if (json.code === 'forbidden.verification_required') {
          throw new Error('MONZO_REAUTH_REQUIRED')
        }
        throw new Error(`Monzo ${resp.status}: ${json.message ?? json.code ?? body}`)
      } catch (e) {
        if ((e as Error).message === 'MONZO_REAUTH_REQUIRED') throw e
        throw new Error(`Monzo ${resp.status}: ${body}`)
      }
    }
    const { transactions } = await resp.json() as { transactions: MonzoTransaction[] }
    all.push(...transactions)
    if (transactions.length < 100) break
    currentCursor = transactions[transactions.length - 1].id
  }

  return all.filter(t => t.amount < 0 && !t.decline_reason && t.scheme !== 'uk_retail_pot')
}
