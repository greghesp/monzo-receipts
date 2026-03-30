import type { SseEvent } from './runner'

/**
 * Shared in-memory state for the currently active (or most recently completed)
 * matching run. Populated by both the API route and the scheduler so the
 * dashboard can show live progress regardless of how the run was triggered.
 */
export const runState = {
  isRunning: false,
  log: [] as SseEvent[],
}
