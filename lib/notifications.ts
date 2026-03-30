import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { homedir } from 'os'
import db from './db'
import { getConfigJson } from './db/queries/config'

const execFileAsync = promisify(execFile)

/**
 * Resolve the apprise executable. Tries, in order:
 *  1. `apprise` on PATH (works if installed system-wide or via pipx)
 *  2. macOS pip --user location: ~/Library/Python/X.Y/bin/apprise
 *  3. Linux pip --user location: ~/.local/bin/apprise
 *  4. Common system paths: /usr/local/bin, /opt/homebrew/bin
 *  5. python3 -m apprise (works when installed but not on PATH)
 *
 * Returns { bin, args } ready for execFile, or throws a friendly error.
 */
async function resolveApprise(): Promise<{ bin: string; extraArgs: string[] }> {
  // 1. Try bare `apprise` — works when it's on PATH
  try {
    await execFileAsync('apprise', ['--version'])
    return { bin: 'apprise', extraArgs: [] }
  } catch (e: any) {
    if (e.code !== 'ENOENT') return { bin: 'apprise', extraArgs: [] } // found but errored
  }

  // 2–4. Check known install locations
  const candidates = [
    ...findPythonUserBins(),
    `${homedir()}/.local/bin/apprise`,
    '/usr/local/bin/apprise',
    '/opt/homebrew/bin/apprise',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return { bin: p, extraArgs: [] }
  }

  // 5. python3 -m apprise
  try {
    await execFileAsync('python3', ['-m', 'apprise', '--version'])
    return { bin: 'python3', extraArgs: ['-m', 'apprise'] }
  } catch { /* not available */ }

  throw new Error(
    'apprise not found. Install it with: pip install apprise\n' +
    'If already installed, ensure it is on your PATH or in ~/Library/Python/X.Y/bin/'
  )
}

function findPythonUserBins(): string[] {
  const base = `${homedir()}/Library/Python`
  if (!existsSync(base)) return []
  try {
    return require('fs')
      .readdirSync(base)
      .map((v: string) => `${base}/${v}/bin/apprise`)
  } catch {
    return []
  }
}

export function buildAppriseArgs(message: string, urls: string[]): string[] {
  if (urls.length === 0) return []
  return ['-b', message, ...urls]
}

export async function notify(message: string): Promise<void> {
  const urls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  if (urls.length === 0) return
  try {
    const { bin, extraArgs } = await resolveApprise()
    await execFileAsync(bin, [...extraArgs, ...buildAppriseArgs(message, urls)])
  } catch (e) {
    console.error('Apprise notification failed:', e)
  }
}

export async function testNotify(): Promise<{ success: boolean; error?: string }> {
  const urls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  if (urls.length === 0) return { success: false, error: 'No Apprise URLs configured' }
  try {
    const { bin, extraArgs } = await resolveApprise()
    await execFileAsync(bin, [...extraArgs, ...buildAppriseArgs('Monzo Receipt Matching — test notification', urls)])
    return { success: true }
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    // Surface a friendly message for the "not installed" case
    const friendly = msg.includes('apprise not found') ? msg : `Apprise error: ${msg}`
    return { success: false, error: friendly }
  }
}
