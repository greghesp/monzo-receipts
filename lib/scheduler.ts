import { schedule, validate, ScheduledTask } from 'node-cron'
import db from './db'
import { getConfig, getConfigJson } from './db/queries/config'
import { runMatch } from './runner'
import { runState } from './run-state'

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
    if (runState.isRunning) {
      console.log('[scheduler] Skipping — run already in progress')
      return
    }
    console.log(`[scheduler] Starting scheduled run — ${new Date().toISOString()}`)
    runState.isRunning = true
    runState.log = []
    try {
      await runMatch(accountIds, event => {
        runState.log.push(event)
        if (event.type === 'done' || event.type === 'error') {
          runState.isRunning = false
          console.log('[scheduler] Run event:', event)
        }
      })
    } catch (e) {
      runState.log.push({ type: 'error', message: String(e) })
      runState.isRunning = false
      console.error('[scheduler] Run failed:', e)
    }
  })

  console.log(`[scheduler] Scheduled — ${cronExpr}`)
}
