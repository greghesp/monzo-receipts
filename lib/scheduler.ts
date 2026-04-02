// lib/scheduler.ts
import { schedule, validate, ScheduledTask } from 'node-cron'
import db from './db'
import { getConfig, getConfigJson } from './db/queries/config'
import { getAllUsers } from './db/queries/users'
import { runMatch } from './runner'
import { getRunState } from './run-state'

const tasks = new Map<number, ScheduledTask>()

export function initScheduler(): void {
  const users = getAllUsers(db)
  for (const user of users) {
    restartSchedulerForUser(user.id)
  }
}

export function restartSchedulerForUser(userId: number): void {
  const existing = tasks.get(userId)
  if (existing) {
    existing.stop()
    tasks.delete(userId)
  }

  const enabled = getConfig(db, 'schedule_enabled', userId) === 'true'
  if (!enabled) return

  const cronExpr = getConfig(db, 'schedule_cron', userId) ?? '0 20 * * *'
  if (!validate(cronExpr)) {
    console.error(`[scheduler] Invalid cron for user ${userId}: ${cronExpr}`)
    return
  }

  const accountIds = getConfigJson<string[]>(db, 'schedule_accounts', userId) ?? []
  if (accountIds.length === 0) {
    console.warn(`[scheduler] No accounts for user ${userId}, skipping`)
    return
  }

  const task = schedule(cronExpr, async () => {
    const state = getRunState(userId)
    if (state.isRunning) {
      console.log(`[scheduler] User ${userId}: skipping — run in progress`)
      return
    }
    console.log(`[scheduler] User ${userId}: starting scheduled run`)
    state.isRunning = true
    state.log = []
    try {
      await runMatch(userId, accountIds, event => {
        state.log.push(event)
        if (event.type === 'done' || event.type === 'error') {
          state.isRunning = false
        }
      })
    } catch (e) {
      state.log.push({ type: 'error', message: String(e) })
      state.isRunning = false
      console.error(`[scheduler] User ${userId} run failed:`, e)
    }
  })

  tasks.set(userId, task)
  console.log(`[scheduler] User ${userId} scheduled — ${cronExpr}`)
}

/** @deprecated use restartSchedulerForUser(userId) */
export function restartScheduler(): void {
  console.warn('[scheduler] restartScheduler() is deprecated — use restartSchedulerForUser(userId)')
}
