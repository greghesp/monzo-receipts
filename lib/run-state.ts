import type { SseEvent } from './runner'

interface UserRunState {
  isRunning: boolean
  log: SseEvent[]
}

const states = new Map<number, UserRunState>()

export function getRunState(userId: number): UserRunState {
  if (!states.has(userId)) {
    states.set(userId, { isRunning: false, log: [] })
  }
  return states.get(userId)!
}

/** @deprecated Use getRunState(userId) instead */
export const runState = { isRunning: false, log: [] as SseEvent[] }
