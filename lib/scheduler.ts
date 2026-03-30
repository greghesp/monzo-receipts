import { schedule, validate, ScheduledTask } from 'node-cron'
import db from './db'
import { getConfig, getConfigJson } from './db/queries/config'
import { runMatch } from './runner'

let currentTask: ScheduledTask | null = null

export function initScheduler(): void {
  restartScheduler()
}

export function restartScheduler(): void {
  if (currentTask) {
    currentTask.stop()
    currentTask = null
  }

  const enabled = getConfig(db, 'schedule_enabled') === 'true'
  if (!enabled) return

  const cronExpr = getConfig(db, 'schedule_cron') ?? '0 20 * * *'
  if (!validate(cronExpr)) {
    console.error(`Invalid cron expression: ${cronExpr}`)
    return
  }

  const accountIds = getConfigJson<string[]>(db, 'schedule_accounts') ?? []
  if (accountIds.length === 0) {
    console.warn('Scheduler: no accounts configured, skipping')
    return
  }

  currentTask = schedule(cronExpr, async () => {
    console.log(`[scheduler] Starting scheduled run — ${new Date().toISOString()}`)
    try {
      await runMatch(accountIds, (event) => {
        if (event.type === 'done' || event.type === 'error') {
          console.log('[scheduler] Run event:', event)
        }
      })
    } catch (e) {
      console.error('[scheduler] Run failed:', e)
    }
  })

  console.log(`[scheduler] Scheduled — ${cronExpr}`)
}
