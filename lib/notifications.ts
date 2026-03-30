import { execFile } from 'child_process'
import { promisify } from 'util'
import db from './db'
import { getConfigJson } from './db/queries/config'

const execFileAsync = promisify(execFile)

export function buildAppriseArgs(message: string, urls: string[]): string[] {
  if (urls.length === 0) return []
  return ['-b', message, ...urls]
}

export async function notify(message: string): Promise<void> {
  const urls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  if (urls.length === 0) return
  const args = buildAppriseArgs(message, urls)
  try {
    await execFileAsync('apprise', args)
  } catch (e) {
    console.error('Apprise notification failed:', e)
  }
}

export async function testNotify(): Promise<{ success: boolean; error?: string }> {
  const urls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  if (urls.length === 0) return { success: false, error: 'No Apprise URLs configured' }
  try {
    await execFileAsync('apprise', buildAppriseArgs('Monzo Receipt Matching — test notification', urls))
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}
