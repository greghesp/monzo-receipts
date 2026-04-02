// Mock the DB singleton so importing notifications.ts does not open the real database
jest.mock('../db', () => ({ default: {} }))

import { buildAppriseArgs } from '../notifications'

describe('buildAppriseArgs', () => {
  it('builds args array with message and URLs', () => {
    const args = buildAppriseArgs('Hello world', ['slack://token/chan', 'ntfy://topic'])
    expect(args).toEqual(['-b', 'Hello world', 'slack://token/chan', 'ntfy://topic'])
  })

  it('returns empty array when no URLs', () => {
    expect(buildAppriseArgs('msg', [])).toEqual([])
  })
})
