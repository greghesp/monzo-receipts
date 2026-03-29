# Monzo Receipt Matching App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally-run Next.js 14 app that matches Gmail receipt emails to Monzo transactions and submits itemised receipt data to the Monzo Receipts API.

**Architecture:** Next.js 14 App Router with explicit `/api/*` routes for all backend operations. SQLite (`better-sqlite3`) stores config, OAuth tokens, match history, and run cursors. `node-cron` runs inside the Next.js process via `instrumentation.ts`. Email parsing uses JSON-LD extraction first, falling back to the Claude API (`claude-haiku-4-5`).

**Tech Stack:** Next.js 14, TypeScript 5, better-sqlite3, node-cron, @anthropic-ai/sdk, googleapis, apprise CLI (Python)

---

## File Map

```
instrumentation.ts                         Next.js lifecycle hook — starts scheduler
next.config.ts                             Enables instrumentationHook
.env.local                                 ANTHROPIC_API_KEY, GOOGLE_CLIENT_ID/SECRET
app/
  layout.tsx                               Root layout
  page.tsx                                 Dashboard
  setup/page.tsx                           First-run credential entry
  settings/page.tsx                        Connections, schedule, notifications
  review/page.tsx                          Approve/skip pending matches
  api/auth/monzo/route.ts                  Redirect to Monzo OAuth
  api/auth/monzo/callback/route.ts         Handle Monzo callback
  api/auth/google/route.ts                 Redirect to Google OAuth
  api/auth/google/callback/route.ts        Handle Google callback
  api/run-match/route.ts                   POST run; streams SSE progress
  api/run-match/status/route.ts            GET current run status
  api/matches/route.ts                     GET match history
  api/matches/[id]/route.ts                PUT approve/skip
  api/settings/route.ts                    GET/PUT config
  api/notifications/test/route.ts          POST test Apprise notification
lib/
  types.ts                                 Shared TypeScript interfaces
  db/
    index.ts                               DB singleton
    schema.ts                              CREATE TABLE statements
    queries/config.ts                      getConfig / setConfig
    queries/tokens.ts                      getToken / saveToken
    queries/matches.ts                     upsertMatch / getMatches / stats
    queries/runs.ts                        createRun / updateRun / getLastRun
  auth/
    monzo.ts                               buildMonzoAuthUrl / exchange / refresh
    google.ts                              getGoogleOAuthClient / buildGoogleAuthUrl
  token-refresh.ts                         getMonzoAccessToken / getGoogleAccessToken
  monzo/
    accounts.ts                            fetchAccounts
    transactions.ts                        fetchTransactionsSince (cursor-paginated)
    receipts.ts                            submitReceipt
  gmail/
    search.ts                              searchReceipts / readEmail
  parsing/
    jsonld.ts                              extractJsonLdOrder
    claude.ts                              parseEmailWithClaude
  matching/
    confidence.ts                          scoreConfidence
    match.ts                               matchEmailsToTransactions
  runner.ts                                runMatch orchestrator
  scheduler.ts                             initScheduler / restartScheduler
  notifications.ts                         notify / testNotify
components/
  AccountMultiSelect.tsx                   Reusable multi-select checkbox list
  ConnectionBadge.tsx                      Green/red connection pill
  dashboard/StatsRow.tsx
  dashboard/RunControls.tsx
  dashboard/ScheduleStatus.tsx
  dashboard/LastRunResults.tsx
  settings/ConnectionsSection.tsx
  settings/ScheduleSection.tsx
  settings/NotificationsSection.tsx
  review/ReviewModal.tsx
```

---

### Task 1: Project Scaffold

**Files:** `package.json`, `next.config.ts`, `jest.config.ts`, `jest.setup.ts`, `.env.local.example`

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

- [ ] **Step 2: Install additional dependencies**

```bash
npm install better-sqlite3 node-cron @anthropic-ai/sdk googleapis
npm install --save-dev @types/better-sqlite3 @types/node-cron jest jest-environment-jsdom ts-jest @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Replace next.config.ts**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    instrumentationHook: true,
  },
}

export default nextConfig
```

- [ ] **Step 4: Create jest.config.ts**

```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default createJestConfig(config)
```

- [ ] **Step 5: Create jest.setup.ts**

```typescript
// jest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Create .env.local.example**

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

- [ ] **Step 7: Add test script to package.json**

Ensure `scripts` contains:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js 14 app with dependencies"
```

---

### Task 2: Shared Types + DB Schema

**Files:**
- Create: `lib/types.ts`
- Create: `lib/db/schema.ts`
- Create: `lib/db/__tests__/schema.test.ts`

- [ ] **Step 1: Create lib/types.ts**

```typescript
// lib/types.ts
export type Provider = 'monzo' | 'google'
export type RunStatus = 'running' | 'done' | 'error'
export type MatchStatus = 'submitted' | 'skipped' | 'pending_review' | 'no_match'
export type Confidence = 'high' | 'medium'

export interface MonzoAccount {
  id: string
  type: string        // 'uk_retail' | 'uk_retail_joint' | 'uk_business'
  description: string
  closed: boolean
}

export interface MonzoTransaction {
  id: string
  amount: number      // negative pence for debits
  currency: string
  created: string     // ISO 8601
  merchant: { name: string } | null
  description: string
}

export interface GmailMessage {
  messageId: string
  subject: string
  from: string
  date: string        // ISO 8601
  html: string
}

export interface ParsedReceipt {
  merchant: string
  total: number       // pence
  currency: string
  date: string        // ISO 8601
  items: Array<{ description: string; amount: number; quantity: number }>
  merchantDetails?: {
    email?: string
    phone?: string
    website?: string
    address?: { address?: string; city?: string; country?: string; postcode?: string }
  }
}

export interface MatchCandidate {
  transaction: MonzoTransaction
  email: GmailMessage
  receipt: ParsedReceipt
  confidence: Confidence
}
```

- [ ] **Step 2: Create lib/db/schema.ts**

```typescript
// lib/db/schema.ts
import Database from 'better-sqlite3'

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      provider      TEXT PRIMARY KEY,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at             INTEGER NOT NULL,
      completed_at           INTEGER,
      status                 TEXT NOT NULL DEFAULT 'running',
      cursor_transaction_id  TEXT,
      transactions_scanned   INTEGER NOT NULL DEFAULT 0,
      matched                INTEGER NOT NULL DEFAULT 0,
      needs_review           INTEGER NOT NULL DEFAULT 0,
      no_match               INTEGER NOT NULL DEFAULT 0,
      error_message          TEXT
    );
    CREATE TABLE IF NOT EXISTS matches (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id   TEXT UNIQUE NOT NULL,
      external_id      TEXT UNIQUE,
      merchant         TEXT NOT NULL,
      amount           INTEGER NOT NULL,
      currency         TEXT NOT NULL DEFAULT 'GBP',
      status           TEXT NOT NULL,
      confidence       TEXT,
      receipt_data     TEXT,
      matched_at       INTEGER NOT NULL
    );
  `)
}
```

- [ ] **Step 3: Write schema test**

```typescript
// lib/db/__tests__/schema.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'

describe('createSchema', () => {
  it('creates all four tables', () => {
    const db = new Database(':memory:')
    createSchema(db)
    const tables = (db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as { name: string }[]).map(r => r.name)
    expect(tables).toEqual(['config', 'matches', 'runs', 'tokens'])
  })

  it('is idempotent', () => {
    const db = new Database(':memory:')
    expect(() => { createSchema(db); createSchema(db) }).not.toThrow()
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/db/__tests__/schema.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/db/schema.ts lib/db/__tests__/schema.test.ts
git commit -m "feat: add shared types and DB schema"
```

---

### Task 3: DB Singleton + Config Queries

**Files:**
- Create: `lib/db/index.ts`
- Create: `lib/db/queries/config.ts`
- Create: `lib/db/__tests__/config.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/db/__tests__/config.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { getConfig, setConfig, getConfigJson, setConfigJson } from '../queries/config'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('config queries', () => {
  it('returns null for missing key', () => {
    expect(getConfig(makeDb(), 'missing')).toBeNull()
  })
  it('sets and gets a string', () => {
    const db = makeDb()
    setConfig(db, 'monzo_client_id', 'oauth2client_abc')
    expect(getConfig(db, 'monzo_client_id')).toBe('oauth2client_abc')
  })
  it('overwrites existing value', () => {
    const db = makeDb()
    setConfig(db, 'lookback_days', '30')
    setConfig(db, 'lookback_days', '60')
    expect(getConfig(db, 'lookback_days')).toBe('60')
  })
  it('sets and gets JSON', () => {
    const db = makeDb()
    setConfigJson(db, 'schedule_accounts', ['acc_1', 'acc_2'])
    expect(getConfigJson(db, 'schedule_accounts')).toEqual(['acc_1', 'acc_2'])
  })
  it('returns null for missing JSON key', () => {
    expect(getConfigJson(makeDb(), 'apprise_urls')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/db/__tests__/config.test.ts
```

Expected: FAIL — `Cannot find module '../queries/config'`

- [ ] **Step 3: Implement config queries**

```typescript
// lib/db/queries/config.ts
import Database from 'better-sqlite3'

export function getConfig(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setConfig(db: Database.Database, key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value)
}

export function getConfigJson<T>(db: Database.Database, key: string): T | null {
  const raw = getConfig(db, key)
  return raw === null ? null : JSON.parse(raw) as T
}

export function setConfigJson<T>(db: Database.Database, key: string, value: T): void {
  setConfig(db, key, JSON.stringify(value))
}
```

- [ ] **Step 4: Create DB singleton**

```typescript
// lib/db/index.ts
import Database from 'better-sqlite3'
import path from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import { createSchema } from './schema'

const DB_DIR = path.join(homedir(), '.monzo-receipts')
const DB_PATH = path.join(DB_DIR, 'db.sqlite')

declare global { var _db: Database.Database | undefined }

function openDb(): Database.Database {
  mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema(db)
  return db
}

const db = global._db ?? openDb()
if (process.env.NODE_ENV !== 'production') global._db = db

export default db
```

- [ ] **Step 5: Run tests**

```bash
npx jest lib/db/__tests__/config.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/db/index.ts lib/db/queries/config.ts lib/db/__tests__/config.test.ts
git commit -m "feat: add DB singleton and config queries"
```

---

### Task 4: Token + Match + Run Queries

**Files:**
- Create: `lib/db/queries/tokens.ts`
- Create: `lib/db/queries/runs.ts`
- Create: `lib/db/queries/matches.ts`
- Create: `lib/db/__tests__/tokens.test.ts`
- Create: `lib/db/__tests__/runs.test.ts`
- Create: `lib/db/__tests__/matches.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/db/__tests__/tokens.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { getToken, saveToken, deleteToken, isTokenExpiredOrExpiringSoon } from '../queries/tokens'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const future = () => Math.floor(Date.now() / 1000) + 7200

describe('token queries', () => {
  it('returns null when no token', () => expect(getToken(makeDb(), 'monzo')).toBeNull())
  it('saves and retrieves', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'at', refresh_token: 'rt', expires_at: future() })
    expect(getToken(db, 'monzo')?.access_token).toBe('at')
  })
  it('overwrites on re-save', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'old', refresh_token: 'r', expires_at: future() })
    saveToken(db, { provider: 'monzo', access_token: 'new', refresh_token: 'r', expires_at: future() })
    expect(getToken(db, 'monzo')?.access_token).toBe('new')
  })
  it('deletes a token', () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'at', refresh_token: 'rt', expires_at: future() })
    deleteToken(db, 'monzo')
    expect(getToken(db, 'monzo')).toBeNull()
  })
  it('detects near-expiry', () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 60
    const token = { provider: 'monzo' as const, access_token: 'at', refresh_token: 'rt', expires_at: nearExpiry }
    expect(isTokenExpiredOrExpiringSoon(token)).toBe(true)
  })
  it('not near-expiry for far future', () => {
    const token = { provider: 'monzo' as const, access_token: 'at', refresh_token: 'rt', expires_at: future() }
    expect(isTokenExpiredOrExpiringSoon(token)).toBe(false)
  })
})
```

```typescript
// lib/db/__tests__/runs.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { createRun, updateRun, getLastSuccessfulRun } from '../queries/runs'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('run queries', () => {
  it('creates a run and returns id', () => expect(createRun(makeDb())).toBeGreaterThan(0))
  it('returns null when no successful run', () => expect(getLastSuccessfulRun(makeDb())).toBeNull())
  it('updates and retrieves cursor', () => {
    const db = makeDb()
    const id = createRun(db)
    updateRun(db, id, { status: 'done', cursor_transaction_id: 'tx_abc', transactions_scanned: 5, matched: 4, needs_review: 1, no_match: 0 })
    expect(getLastSuccessfulRun(db)?.cursor_transaction_id).toBe('tx_abc')
  })
})
```

```typescript
// lib/db/__tests__/matches.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../schema'
import { upsertMatch, getMatchByTransactionId, getPendingReviewMatches, getMatchStats } from '../queries/matches'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const base = { external_id: null, merchant: 'X', amount: 100, currency: 'GBP', receipt_data: null }

describe('match queries', () => {
  it('inserts and retrieves a match', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    expect(getMatchByTransactionId(db, 'tx_1')?.status).toBe('submitted')
  })
  it('updates on conflict', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    expect(getMatchByTransactionId(db, 'tx_1')?.status).toBe('submitted')
  })
  it('returns pending review matches', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_2', status: 'submitted', confidence: 'high' })
    expect(getPendingReviewMatches(db)).toHaveLength(1)
  })
  it('returns correct stats', () => {
    const db = makeDb()
    upsertMatch(db, { ...base, transaction_id: 'tx_1', status: 'submitted', confidence: 'high' })
    upsertMatch(db, { ...base, transaction_id: 'tx_2', status: 'pending_review', confidence: 'medium' })
    upsertMatch(db, { ...base, transaction_id: 'tx_3', status: 'no_match', confidence: null })
    const s = getMatchStats(db)
    expect(s).toEqual({ total: 3, submitted: 1, pending_review: 1, no_match: 1, skipped: 0 })
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npx jest lib/db/__tests__/tokens.test.ts lib/db/__tests__/runs.test.ts lib/db/__tests__/matches.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement token queries**

```typescript
// lib/db/queries/tokens.ts
import Database from 'better-sqlite3'
import type { Provider } from '../../types'

export interface TokenRow {
  provider: Provider
  access_token: string
  refresh_token: string
  expires_at: number
}

export function getToken(db: Database.Database, provider: Provider): TokenRow | null {
  return db.prepare('SELECT * FROM tokens WHERE provider = ?').get(provider) as TokenRow | null
}

export function saveToken(db: Database.Database, token: TokenRow): void {
  db.prepare(`
    INSERT OR REPLACE INTO tokens (provider, access_token, refresh_token, expires_at)
    VALUES (@provider, @access_token, @refresh_token, @expires_at)
  `).run(token)
}

export function deleteToken(db: Database.Database, provider: Provider): void {
  db.prepare('DELETE FROM tokens WHERE provider = ?').run(provider)
}

export function isTokenExpiredOrExpiringSoon(token: TokenRow): boolean {
  return token.expires_at < Math.floor(Date.now() / 1000) + 300
}
```

- [ ] **Step 4: Implement run queries**

```typescript
// lib/db/queries/runs.ts
import Database from 'better-sqlite3'
import type { RunStatus } from '../../types'

export interface RunRow {
  id: number
  started_at: number
  completed_at: number | null
  status: RunStatus
  cursor_transaction_id: string | null
  transactions_scanned: number
  matched: number
  needs_review: number
  no_match: number
  error_message: string | null
}

export interface RunUpdate {
  status: RunStatus
  cursor_transaction_id?: string | null
  transactions_scanned?: number
  matched?: number
  needs_review?: number
  no_match?: number
  error_message?: string | null
}

export function createRun(db: Database.Database): number {
  const r = db.prepare('INSERT INTO runs (started_at, status) VALUES (?, ?)').run(Math.floor(Date.now() / 1000), 'running')
  return r.lastInsertRowid as number
}

export function updateRun(db: Database.Database, id: number, u: RunUpdate): void {
  db.prepare(`
    UPDATE runs SET
      status = @status, completed_at = @completed_at,
      cursor_transaction_id = COALESCE(@cursor_transaction_id, cursor_transaction_id),
      transactions_scanned = @transactions_scanned, matched = @matched,
      needs_review = @needs_review, no_match = @no_match, error_message = @error_message
    WHERE id = @id
  `).run({ id, status: u.status, completed_at: Math.floor(Date.now() / 1000),
    cursor_transaction_id: u.cursor_transaction_id ?? null,
    transactions_scanned: u.transactions_scanned ?? 0, matched: u.matched ?? 0,
    needs_review: u.needs_review ?? 0, no_match: u.no_match ?? 0,
    error_message: u.error_message ?? null })
}

export function getLastSuccessfulRun(db: Database.Database): RunRow | null {
  return db.prepare("SELECT * FROM runs WHERE status = 'done' ORDER BY id DESC LIMIT 1").get() as RunRow | null
}

export function getLastRun(db: Database.Database): RunRow | null {
  return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get() as RunRow | null
}
```

- [ ] **Step 5: Implement match queries**

```typescript
// lib/db/queries/matches.ts
import Database from 'better-sqlite3'
import type { MatchStatus, Confidence } from '../../types'

export interface MatchRow {
  id: number
  transaction_id: string
  external_id: string | null
  merchant: string
  amount: number
  currency: string
  status: MatchStatus
  confidence: Confidence | null
  receipt_data: string | null
  matched_at: number
}

export interface UpsertMatchInput {
  transaction_id: string
  external_id: string | null
  merchant: string
  amount: number
  currency: string
  status: MatchStatus
  confidence: Confidence | null
  receipt_data: string | null
}

export function upsertMatch(db: Database.Database, input: UpsertMatchInput): void {
  db.prepare(`
    INSERT INTO matches (transaction_id, external_id, merchant, amount, currency, status, confidence, receipt_data, matched_at)
    VALUES (@transaction_id, @external_id, @merchant, @amount, @currency, @status, @confidence, @receipt_data, @matched_at)
    ON CONFLICT(transaction_id) DO UPDATE SET
      external_id = excluded.external_id, status = excluded.status,
      confidence = excluded.confidence, receipt_data = excluded.receipt_data,
      matched_at = excluded.matched_at
  `).run({ ...input, matched_at: Math.floor(Date.now() / 1000) })
}

export function getMatchByTransactionId(db: Database.Database, txId: string): MatchRow | null {
  return db.prepare('SELECT * FROM matches WHERE transaction_id = ?').get(txId) as MatchRow | null
}

export function getMatchById(db: Database.Database, id: number): MatchRow | null {
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | null
}

export function getPendingReviewMatches(db: Database.Database): MatchRow[] {
  return db.prepare("SELECT * FROM matches WHERE status = 'pending_review' ORDER BY matched_at DESC").all() as MatchRow[]
}

export function updateMatchStatus(db: Database.Database, id: number, status: MatchStatus): void {
  db.prepare('UPDATE matches SET status = ? WHERE id = ?').run(status, id)
}

export function getMatches(db: Database.Database, limit = 50, offset = 0): MatchRow[] {
  return db.prepare('SELECT * FROM matches ORDER BY matched_at DESC LIMIT ? OFFSET ?').all(limit, offset) as MatchRow[]
}

export function getMatchStats(db: Database.Database): { total: number; submitted: number; pending_review: number; no_match: number; skipped: number } {
  const rows = db.prepare('SELECT status, COUNT(*) as count FROM matches GROUP BY status').all() as { status: MatchStatus; count: number }[]
  const m = Object.fromEntries(rows.map(r => [r.status, r.count]))
  return { total: rows.reduce((s, r) => s + r.count, 0), submitted: m.submitted ?? 0, pending_review: m.pending_review ?? 0, no_match: m.no_match ?? 0, skipped: m.skipped ?? 0 }
}
```

- [ ] **Step 6: Run tests**

```bash
npx jest lib/db/__tests__/
```

Expected: PASS (all DB tests)

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries/ lib/db/__tests__/
git commit -m "feat: add token, run, and match queries"
```

---

### Task 5: Monzo OAuth

**Files:**
- Create: `lib/auth/monzo.ts`
- Create: `lib/auth/__tests__/monzo.test.ts`
- Create: `app/api/auth/monzo/route.ts`
- Create: `app/api/auth/monzo/callback/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/auth/__tests__/monzo.test.ts
import { buildMonzoAuthUrl } from '../monzo'

describe('buildMonzoAuthUrl', () => {
  it('builds correct auth URL', () => {
    const url = new URL(buildMonzoAuthUrl('oauth2client_test'))
    expect(url.hostname).toBe('auth.monzo.com')
    expect(url.searchParams.get('client_id')).toBe('oauth2client_test')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/monzo/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/auth/__tests__/monzo.test.ts
```

- [ ] **Step 3: Implement lib/auth/monzo.ts**

```typescript
// lib/auth/monzo.ts
import crypto from 'crypto'

const REDIRECT_URI = 'http://localhost:3000/api/auth/monzo/callback'

export function buildMonzoAuthUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    state: crypto.randomBytes(16).toString('hex'),
  })
  return `https://auth.monzo.com/?${params}`
}

export async function exchangeMonzoCode(code: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://api.monzo.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI, code }),
  })
  if (!resp.ok) throw new Error(`Monzo token exchange failed: ${await resp.text()}`)
  return resp.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function refreshMonzoToken(refreshToken: string, clientId: string, clientSecret: string) {
  const resp = await fetch('https://api.monzo.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }),
  })
  if (!resp.ok) throw new Error('Monzo token refresh failed')
  return resp.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}
```

- [ ] **Step 4: Run test**

```bash
npx jest lib/auth/__tests__/monzo.test.ts
```

Expected: PASS

- [ ] **Step 5: Create Monzo OAuth routes**

```typescript
// app/api/auth/monzo/route.ts
import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig } from '@/lib/db/queries/config'
import { buildMonzoAuthUrl } from '@/lib/auth/monzo'

export async function GET() {
  const clientId = getConfig(db, 'monzo_client_id')
  if (!clientId) return NextResponse.redirect(new URL('/setup', 'http://localhost:3000'))
  return NextResponse.redirect(buildMonzoAuthUrl(clientId))
}
```

```typescript
// app/api/auth/monzo/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig } from '@/lib/db/queries/config'
import { saveToken } from '@/lib/db/queries/tokens'
import { exchangeMonzoCode } from '@/lib/auth/monzo'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', 'http://localhost:3000'))
  try {
    const t = await exchangeMonzoCode(code, getConfig(db, 'monzo_client_id')!, getConfig(db, 'monzo_client_secret')!)
    saveToken(db, { provider: 'monzo', access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Math.floor(Date.now() / 1000) + t.expires_in })
    return NextResponse.redirect(new URL('/', 'http://localhost:3000'))
  } catch {
    return NextResponse.redirect(new URL('/?error=monzo_auth_failed', 'http://localhost:3000'))
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/auth/monzo.ts lib/auth/__tests__/monzo.test.ts app/api/auth/monzo/
git commit -m "feat: add Monzo OAuth routes"
```

---

### Task 6: Google OAuth

**Files:**
- Create: `lib/auth/google.ts`
- Create: `lib/auth/__tests__/google.test.ts`
- Create: `app/api/auth/google/route.ts`
- Create: `app/api/auth/google/callback/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/auth/__tests__/google.test.ts
import { getGoogleOAuthClient } from '../google'

describe('getGoogleOAuthClient', () => {
  it('sets redirect URI correctly', () => {
    const client = getGoogleOAuthClient('cid', 'csec')
    expect(client.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/auth/__tests__/google.test.ts
```

- [ ] **Step 3: Implement lib/auth/google.ts**

```typescript
// lib/auth/google.ts
import { google } from 'googleapis'

const REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export function getGoogleOAuthClient(clientId: string, clientSecret: string) {
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export function buildGoogleAuthUrl(clientId: string, clientSecret: string): string {
  return getGoogleOAuthClient(clientId, clientSecret).generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}
```

- [ ] **Step 4: Run test**

```bash
npx jest lib/auth/__tests__/google.test.ts
```

Expected: PASS

- [ ] **Step 5: Create Google OAuth routes**

```typescript
// app/api/auth/google/route.ts
import { NextResponse } from 'next/server'
import { buildGoogleAuthUrl } from '@/lib/auth/google'

export async function GET() {
  return NextResponse.redirect(buildGoogleAuthUrl(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!))
}
```

```typescript
// app/api/auth/google/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { saveToken } from '@/lib/db/queries/tokens'
import { getGoogleOAuthClient } from '@/lib/auth/google'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/?error=no_code', 'http://localhost:3000'))
  try {
    const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
    const { tokens } = await client.getToken(code)
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('Missing tokens')
    saveToken(db, { provider: 'google', access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: Math.floor((tokens.expiry_date ?? Date.now() + 3_600_000) / 1000) })
    return NextResponse.redirect(new URL('/', 'http://localhost:3000'))
  } catch {
    return NextResponse.redirect(new URL('/?error=google_auth_failed', 'http://localhost:3000'))
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/auth/google.ts lib/auth/__tests__/google.test.ts app/api/auth/google/
git commit -m "feat: add Google OAuth routes"
```

---

### Task 7: Token Refresh Utilities

**Files:**
- Create: `lib/token-refresh.ts`
- Create: `lib/__tests__/token-refresh.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/__tests__/token-refresh.test.ts
import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import { saveToken } from '../db/queries/tokens'
import { setConfig } from '../db/queries/config'

jest.mock('../auth/monzo', () => ({
  refreshMonzoToken: jest.fn().mockResolvedValue({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 3600 }),
}))

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }
const future = () => Math.floor(Date.now() / 1000) + 7200
const nearExpiry = () => Math.floor(Date.now() / 1000) + 60

describe('getMonzoAccessToken', () => {
  let getMonzoAccessToken: (db: Database.Database) => Promise<string>

  beforeEach(async () => {
    jest.resetModules()
    ;({ getMonzoAccessToken } = await import('../token-refresh'))
  })

  it('returns current token when not expiring', async () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'valid', refresh_token: 'rt', expires_at: future() })
    setConfig(db, 'monzo_client_id', 'cid')
    setConfig(db, 'monzo_client_secret', 'csec')
    expect(await getMonzoAccessToken(db)).toBe('valid')
  })

  it('throws when no token stored', async () => {
    await expect(getMonzoAccessToken(makeDb())).rejects.toThrow('Monzo not connected')
  })

  it('refreshes when near expiry', async () => {
    const db = makeDb()
    saveToken(db, { provider: 'monzo', access_token: 'old', refresh_token: 'rt', expires_at: nearExpiry() })
    setConfig(db, 'monzo_client_id', 'cid')
    setConfig(db, 'monzo_client_secret', 'csec')
    expect(await getMonzoAccessToken(db)).toBe('new_at')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/__tests__/token-refresh.test.ts
```

- [ ] **Step 3: Implement lib/token-refresh.ts**

```typescript
// lib/token-refresh.ts
import Database from 'better-sqlite3'
import { getToken, saveToken, isTokenExpiredOrExpiringSoon } from './db/queries/tokens'
import { getConfig } from './db/queries/config'
import { refreshMonzoToken } from './auth/monzo'
import { getGoogleOAuthClient } from './auth/google'

export async function getMonzoAccessToken(db: Database.Database): Promise<string> {
  const token = getToken(db, 'monzo')
  if (!token) throw new Error('Monzo not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token

  const clientId = getConfig(db, 'monzo_client_id')!
  const clientSecret = getConfig(db, 'monzo_client_secret')!
  const fresh = await refreshMonzoToken(token.refresh_token, clientId, clientSecret)
  saveToken(db, { provider: 'monzo', access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: Math.floor(Date.now() / 1000) + fresh.expires_in })
  return fresh.access_token
}

export async function getGoogleAccessToken(db: Database.Database): Promise<string> {
  const token = getToken(db, 'google')
  if (!token) throw new Error('Gmail not connected')
  if (!isTokenExpiredOrExpiringSoon(token)) return token.access_token

  const client = getGoogleOAuthClient(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!)
  client.setCredentials({ refresh_token: token.refresh_token })
  const { credentials } = await client.refreshAccessToken()
  if (!credentials.access_token) throw new Error('Google token refresh failed')
  saveToken(db, { provider: 'google', access_token: credentials.access_token, refresh_token: credentials.refresh_token ?? token.refresh_token, expires_at: Math.floor((credentials.expiry_date ?? Date.now() + 3_600_000) / 1000) })
  return credentials.access_token
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/__tests__/token-refresh.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/token-refresh.ts lib/__tests__/token-refresh.test.ts
git commit -m "feat: add token refresh utilities"
```

---

### Task 8: Monzo API — Accounts + Transactions

**Files:**
- Create: `lib/monzo/accounts.ts`
- Create: `lib/monzo/transactions.ts`
- Create: `lib/monzo/__tests__/transactions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/monzo/__tests__/transactions.test.ts
import { filterActiveAccounts, buildTransactionUrl } from '../transactions'
import type { MonzoAccount } from '../../types'

describe('filterActiveAccounts', () => {
  const accounts: MonzoAccount[] = [
    { id: 'acc_1', type: 'uk_retail', description: 'Personal', closed: false },
    { id: 'acc_2', type: 'uk_prepaid', description: 'Prepaid', closed: false },
    { id: 'acc_3', type: 'uk_retail_joint', description: 'Joint', closed: false },
    { id: 'acc_4', type: 'uk_monzo_flex', description: 'Flex', closed: false },
    { id: 'acc_5', type: 'uk_retail', description: 'Old', closed: true },
  ]

  it('keeps uk_retail, uk_retail_joint, uk_business', () => {
    const result = filterActiveAccounts(accounts)
    expect(result.map(a => a.id)).toEqual(['acc_1', 'acc_3'])
  })
})

describe('buildTransactionUrl', () => {
  it('uses since as ISO string when no cursor', () => {
    const url = buildTransactionUrl('acc_1', '2026-01-01T00:00:00Z', undefined)
    expect(url).toContain('since=2026-01-01T00%3A00%3A00Z')
  })
  it('uses cursor transaction id when provided', () => {
    const url = buildTransactionUrl('acc_1', '2026-01-01T00:00:00Z', 'tx_prev')
    expect(url).toContain('since=tx_prev')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/monzo/__tests__/transactions.test.ts
```

- [ ] **Step 3: Implement lib/monzo/accounts.ts**

```typescript
// lib/monzo/accounts.ts
import type { MonzoAccount } from '../types'

const ALLOWED_TYPES = new Set(['uk_retail', 'uk_retail_joint', 'uk_business'])

export async function fetchAccounts(accessToken: string): Promise<MonzoAccount[]> {
  const resp = await fetch('https://api.monzo.com/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) throw new Error(`Failed to fetch accounts: ${resp.status}`)
  const { accounts } = await resp.json() as { accounts: MonzoAccount[] }
  return filterActiveAccounts(accounts)
}

export function filterActiveAccounts(accounts: MonzoAccount[]): MonzoAccount[] {
  return accounts.filter(a => ALLOWED_TYPES.has(a.type) && !a.closed)
}
```

- [ ] **Step 4: Implement lib/monzo/transactions.ts**

```typescript
// lib/monzo/transactions.ts
import type { MonzoTransaction } from '../types'

export function buildTransactionUrl(accountId: string, sinceIso: string, cursor: string | undefined): string {
  const since = cursor ?? sinceIso
  return `https://api.monzo.com/transactions?account_id=${accountId}&since=${encodeURIComponent(since)}&expand[]=merchant&limit=100`
}

export async function fetchTransactionsSince(
  accessToken: string,
  accountId: string,
  since: string,        // ISO date string — used only when no cursor
  cursor?: string       // last transaction ID from previous run
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

  // Return debits only (negative amount)
  return all.filter(t => t.amount < 0)
}
```

- [ ] **Step 5: Export filterActiveAccounts and buildTransactionUrl from transactions.ts** (for test access)

Add to `lib/monzo/transactions.ts`:
```typescript
export { filterActiveAccounts } from './accounts'
```

Wait — `filterActiveAccounts` is defined in `accounts.ts`. Update the test import to use `'../accounts'` for `filterActiveAccounts`:

```typescript
// lib/monzo/__tests__/transactions.test.ts — update imports
import { filterActiveAccounts } from '../accounts'
import { buildTransactionUrl } from '../transactions'
```

- [ ] **Step 6: Run tests**

```bash
npx jest lib/monzo/__tests__/transactions.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/monzo/accounts.ts lib/monzo/transactions.ts lib/monzo/__tests__/transactions.test.ts
git commit -m "feat: add Monzo accounts and transaction fetching"
```

---

### Task 9: Gmail API — Search + Read

**Files:**
- Create: `lib/gmail/search.ts`
- Create: `lib/gmail/__tests__/search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/gmail/__tests__/search.test.ts
import { buildGmailQuery } from '../search'

describe('buildGmailQuery', () => {
  it('builds query with after date', () => {
    const q = buildGmailQuery('2026-03-01T00:00:00Z')
    expect(q).toContain('after:2026/03/01')
    expect(q).toContain('subject:(order OR receipt OR confirmation OR invoice)')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/gmail/__tests__/search.test.ts
```

- [ ] **Step 3: Implement lib/gmail/search.ts**

```typescript
// lib/gmail/search.ts
import { google } from 'googleapis'
import type { GmailMessage } from '../types'

export function buildGmailQuery(sinceIso: string): string {
  const d = new Date(sinceIso)
  const dateStr = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
  return `subject:(order OR receipt OR confirmation OR invoice) after:${dateStr}`
}

export async function searchReceipts(
  accessToken: string,
  sinceIso: string,
  maxResults = 200
): Promise<string[]> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const resp = await gmail.users.messages.list({
    userId: 'me',
    q: buildGmailQuery(sinceIso),
    maxResults,
  })

  return (resp.data.messages ?? []).map(m => m.id!)
}

export async function readEmail(accessToken: string, messageId: string): Promise<GmailMessage> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
  const headers = msg.data.payload?.headers ?? []
  const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value ?? ''

  const html = extractHtmlBody(msg.data.payload)

  return {
    messageId,
    subject: get('subject'),
    from: get('from'),
    date: get('date'),
    html,
  }
}

function extractHtmlBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  for (const part of payload.parts ?? []) {
    const result = extractHtmlBody(part)
    if (result) return result
  }
  // Fall back to plain text
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  return ''
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/gmail/__tests__/search.test.ts
```

Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add lib/gmail/search.ts lib/gmail/__tests__/search.test.ts
git commit -m "feat: add Gmail search and email reading"
```

---

### Task 10: JSON-LD Email Parser

**Files:**
- Create: `lib/parsing/jsonld.ts`
- Create: `lib/parsing/__tests__/jsonld.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/parsing/__tests__/jsonld.test.ts
import { extractJsonLdOrder } from '../jsonld'

const makeHtml = (json: object) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head></html>`

describe('extractJsonLdOrder', () => {
  it('returns null when no JSON-LD present', () => {
    expect(extractJsonLdOrder('<html><body>no script</body></html>')).toBeNull()
  })

  it('extracts a top-level Order node', () => {
    const html = makeHtml({
      '@context': 'https://schema.org',
      '@type': 'Order',
      orderNumber: 'ORD-123',
      price: '24.99',
      priceCurrency: 'GBP',
      orderDate: '2026-03-01T10:00:00Z',
      merchant: { name: 'Amazon' },
      orderedItem: [
        { '@type': 'OrderItem', orderQuantity: 1, orderedItem: { name: 'Headphones' }, orderItemPrice: { price: '24.99', priceCurrency: 'GBP' } }
      ],
    })
    const result = extractJsonLdOrder(html)
    expect(result).not.toBeNull()
    expect(result!.merchant).toBe('Amazon')
    expect(result!.total).toBe(2499)
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].description).toBe('Headphones')
    expect(result!.items[0].amount).toBe(2499)
  })

  it('extracts from @graph array', () => {
    const html = makeHtml({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'Shop' },
        { '@type': 'Order', price: '10.00', priceCurrency: 'GBP', orderDate: '2026-03-01T00:00:00Z', merchant: { name: 'Shop' }, orderedItem: [] },
      ],
    })
    const result = extractJsonLdOrder(html)
    expect(result?.merchant).toBe('Shop')
  })

  it('returns null for non-Order JSON-LD', () => {
    const html = makeHtml({ '@type': 'Product', name: 'Widget' })
    expect(extractJsonLdOrder(html)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/parsing/__tests__/jsonld.test.ts
```

- [ ] **Step 3: Implement lib/parsing/jsonld.ts**

```typescript
// lib/parsing/jsonld.ts
import type { ParsedReceipt } from '../types'

export function extractJsonLdOrder(html: string): ParsedReceipt | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      const nodes: any[] = Array.isArray(data)
        ? data
        : data['@graph']
        ? data['@graph']
        : [data]

      for (const node of nodes) {
        if (node['@type'] === 'Order' || node['@type'] === 'Invoice') {
          return parseOrderNode(node)
        }
      }
    } catch {
      continue
    }
  }
  return null
}

function priceToPence(price: string | number | undefined): number {
  if (price === undefined) return 0
  return Math.round(parseFloat(String(price)) * 100)
}

function parseOrderNode(node: any): ParsedReceipt {
  const total =
    priceToPence(node.price) ||
    priceToPence(node.totalPaymentDue?.price) ||
    priceToPence(node.totalPrice)

  const merchant =
    node.merchant?.name ||
    node.seller?.name ||
    node.vendor?.name ||
    'Unknown'

  const items = (node.orderedItem ?? []).map((item: any) => ({
    description: item.orderedItem?.name ?? item.name ?? 'Item',
    amount: priceToPence(item.orderItemPrice?.price ?? item.price),
    quantity: Number(item.orderQuantity ?? 1),
  }))

  return {
    merchant,
    total,
    currency: node.priceCurrency ?? 'GBP',
    date: node.orderDate ?? new Date().toISOString(),
    items,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/parsing/__tests__/jsonld.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parsing/jsonld.ts lib/parsing/__tests__/jsonld.test.ts
git commit -m "feat: add JSON-LD email parser"
```

---

### Task 11: Claude API Email Parser (fallback)

**Files:**
- Create: `lib/parsing/claude.ts`
- Create: `lib/parsing/__tests__/claude.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/parsing/__tests__/claude.test.ts
import { buildParsingPrompt } from '../claude'

describe('buildParsingPrompt', () => {
  it('includes email content in prompt', () => {
    const prompt = buildParsingPrompt('Amazon', 'Your order total is £9.99', 'amazon@amazon.co.uk')
    expect(prompt).toContain('amazon@amazon.co.uk')
    expect(prompt).toContain('£9.99')
  })

  it('requests JSON output', () => {
    const prompt = buildParsingPrompt('Test', 'body', 'test@test.com')
    expect(prompt.toLowerCase()).toContain('json')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/parsing/__tests__/claude.test.ts
```

- [ ] **Step 3: Implement lib/parsing/claude.ts**

```typescript
// lib/parsing/claude.ts
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedReceipt } from '../types'

const client = new Anthropic()

export function buildParsingPrompt(subject: string, body: string, from: string): string {
  return `You are a receipt data extractor. Extract structured receipt information from this email.

From: ${from}
Subject: ${subject}

Email body:
${body.slice(0, 8000)}

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "merchant": "string — merchant name",
  "total": number — total in pence (e.g. £9.99 = 999),
  "currency": "GBP",
  "date": "ISO 8601 date string",
  "items": [
    { "description": "string", "amount": number (pence), "quantity": number }
  ],
  "merchantDetails": {
    "email": "string or omit",
    "phone": "string or omit",
    "website": "string or omit",
    "address": { "address": "string or omit", "city": "string or omit", "country": "GB", "postcode": "string or omit" }
  }
}

Rules:
- amounts are integers in pence (£1.00 = 100)
- one email line = one item, do not aggregate
- omit merchantDetails fields that are not present in the email
- if total cannot be determined, set total to 0`
}

export async function parseEmailWithClaude(
  subject: string,
  html: string,
  from: string
): Promise<ParsedReceipt | null> {
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildParsingPrompt(subject, html, from) }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text) as ParsedReceipt
    if (!parsed.merchant || parsed.total === undefined) return null
    return parsed
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/parsing/__tests__/claude.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parsing/claude.ts lib/parsing/__tests__/claude.test.ts
git commit -m "feat: add Claude API email parser fallback"
```

---

### Task 12: Match Algorithm + Confidence Scoring

**Files:**
- Create: `lib/matching/confidence.ts`
- Create: `lib/matching/match.ts`
- Create: `lib/matching/__tests__/confidence.test.ts`
- Create: `lib/matching/__tests__/match.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/matching/__tests__/confidence.test.ts
import { scoreConfidence } from '../confidence'
import type { MonzoTransaction, ParsedReceipt } from '../../types'

const tx: MonzoTransaction = {
  id: 'tx_1', amount: -2499, currency: 'GBP',
  created: '2026-03-14T10:00:00Z',
  merchant: { name: 'Amazon' }, description: 'Amazon',
}
const receipt: ParsedReceipt = {
  merchant: 'Amazon', total: 2499, currency: 'GBP',
  date: '2026-03-14T10:00:00Z', items: [],
}

describe('scoreConfidence', () => {
  it('HIGH when amount matches and date within 1 day', () => {
    expect(scoreConfidence(tx, receipt)).toBe('high')
  })

  it('MEDIUM when amount matches but date offset is 1 day', () => {
    const r = { ...receipt, date: '2026-03-15T10:00:00Z' }
    expect(scoreConfidence(tx, r)).toBe('medium')
  })

  it('null when amount does not match', () => {
    const r = { ...receipt, total: 999 }
    expect(scoreConfidence(tx, r)).toBeNull()
  })

  it('null when date offset > 1 day', () => {
    const r = { ...receipt, date: '2026-03-18T10:00:00Z' }
    expect(scoreConfidence(tx, r)).toBeNull()
  })

  it('handles negative tx amount correctly (debits are negative)', () => {
    const debit = { ...tx, amount: -999 }
    const r = { ...receipt, total: 999 }
    expect(scoreConfidence(debit, r)).toBe('high')
  })
})
```

```typescript
// lib/matching/__tests__/match.test.ts
import { matchEmailsToTransactions } from '../match'
import type { MonzoTransaction, GmailMessage, ParsedReceipt } from '../../types'

const tx: MonzoTransaction = {
  id: 'tx_1', amount: -2499, currency: 'GBP',
  created: '2026-03-14T10:00:00Z',
  merchant: { name: 'Amazon' }, description: 'Amazon',
}
const email: GmailMessage = {
  messageId: 'msg_1', subject: 'Your Amazon order', from: 'ship-confirm@amazon.co.uk',
  date: '2026-03-14T11:00:00Z', html: '',
}
const receipt: ParsedReceipt = {
  merchant: 'Amazon', total: 2499, currency: 'GBP',
  date: '2026-03-14T11:00:00Z', items: [{ description: 'Headphones', amount: 2499, quantity: 1 }],
}

describe('matchEmailsToTransactions', () => {
  it('returns high confidence match', () => {
    const results = matchEmailsToTransactions([tx], [{ email, receipt }])
    expect(results).toHaveLength(1)
    expect(results[0].confidence).toBe('high')
    expect(results[0].transaction.id).toBe('tx_1')
  })

  it('returns empty when amounts differ', () => {
    const badReceipt = { ...receipt, total: 100 }
    expect(matchEmailsToTransactions([tx], [{ email, receipt: badReceipt }])).toHaveLength(0)
  })

  it('does not double-match — one email per transaction', () => {
    const tx2 = { ...tx, id: 'tx_2' }
    const results = matchEmailsToTransactions([tx, tx2], [{ email, receipt }])
    expect(results).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to confirm failures**

```bash
npx jest lib/matching/__tests__/
```

- [ ] **Step 3: Implement lib/matching/confidence.ts**

```typescript
// lib/matching/confidence.ts
import type { MonzoTransaction, ParsedReceipt, Confidence } from '../types'

const ONE_DAY_MS = 86_400_000

export function scoreConfidence(tx: MonzoTransaction, receipt: ParsedReceipt): Confidence | null {
  const txAmount = Math.abs(tx.amount)
  if (txAmount !== receipt.total) return null

  const txDate = new Date(tx.created).getTime()
  const receiptDate = new Date(receipt.date).getTime()
  const diffMs = Math.abs(txDate - receiptDate)

  if (diffMs <= ONE_DAY_MS) return 'high'
  if (diffMs <= ONE_DAY_MS * 2) return 'medium'
  return null
}

export function merchantSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = norm(a), nb = norm(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8
  return 0
}
```

- [ ] **Step 4: Implement lib/matching/match.ts**

```typescript
// lib/matching/match.ts
import type { MonzoTransaction, GmailMessage, ParsedReceipt, MatchCandidate } from '../types'
import { scoreConfidence } from './confidence'

export interface EmailWithReceipt {
  email: GmailMessage
  receipt: ParsedReceipt
}

export function matchEmailsToTransactions(
  transactions: MonzoTransaction[],
  emailsWithReceipts: EmailWithReceipt[]
): MatchCandidate[] {
  const results: MatchCandidate[] = []
  const usedTransactionIds = new Set<string>()

  for (const { email, receipt } of emailsWithReceipts) {
    let bestMatch: { tx: MonzoTransaction; confidence: 'high' | 'medium' } | null = null

    for (const tx of transactions) {
      if (usedTransactionIds.has(tx.id)) continue
      const confidence = scoreConfidence(tx, receipt)
      if (!confidence) continue
      // Prefer high over medium
      if (!bestMatch || (confidence === 'high' && bestMatch.confidence === 'medium')) {
        bestMatch = { tx, confidence }
      }
    }

    if (bestMatch) {
      usedTransactionIds.add(bestMatch.tx.id)
      results.push({ transaction: bestMatch.tx, email, receipt, confidence: bestMatch.confidence })
    }
  }

  return results
}
```

- [ ] **Step 5: Run tests**

```bash
npx jest lib/matching/__tests__/
```

Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/matching/ 
git commit -m "feat: add match algorithm and confidence scoring"
```

---

### Task 13: Monzo Receipts API Submission

**Files:**
- Create: `lib/monzo/receipts.ts`
- Create: `lib/monzo/__tests__/receipts.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/monzo/__tests__/receipts.test.ts
import { buildReceiptPayload } from '../receipts'
import type { MatchCandidate } from '../../types'

const candidate: MatchCandidate = {
  transaction: { id: 'tx_1', amount: -2499, currency: 'GBP', created: '2026-03-14T10:00:00Z', merchant: { name: 'Amazon' }, description: 'Amazon' },
  email: { messageId: 'msg_abc', subject: 'Order', from: 'ship@amazon.co.uk', date: '2026-03-14T10:00:00Z', html: '' },
  receipt: {
    merchant: 'Amazon', total: 2499, currency: 'GBP', date: '2026-03-14T10:00:00Z',
    items: [{ description: 'Headphones', amount: 2499, quantity: 1 }],
    merchantDetails: { email: 'help@amazon.co.uk', website: 'https://amazon.co.uk' },
  },
  confidence: 'high',
}

describe('buildReceiptPayload', () => {
  it('sets transaction_id and external_id correctly', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.transaction_id).toBe('tx_1')
    expect(p.external_id).toBe('gmail-msg_abc')
  })

  it('sets total in pence', () => {
    expect(buildReceiptPayload(candidate).total).toBe(2499)
  })

  it('includes items', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.items).toHaveLength(1)
    expect(p.items[0].description).toBe('Headphones')
  })

  it('includes merchant details', () => {
    const p = buildReceiptPayload(candidate)
    expect(p.merchant.email).toBe('help@amazon.co.uk')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/monzo/__tests__/receipts.test.ts
```

- [ ] **Step 3: Implement lib/monzo/receipts.ts**

```typescript
// lib/monzo/receipts.ts
import type { MatchCandidate } from '../types'

export interface ReceiptPayload {
  transaction_id: string
  external_id: string
  total: number
  currency: string
  date: string
  merchant: {
    name: string
    online: boolean
    email?: string
    phone?: string
    website?: string
    category?: string
    address?: { address?: string; city?: string; country?: string; postcode?: string }
  }
  items: Array<{ description: string; amount: number; quantity: number }>
  payments: Array<{ type: string; amount: number; currency: string }>
}

export function buildReceiptPayload(candidate: MatchCandidate): ReceiptPayload {
  const { transaction, email, receipt } = candidate
  const d = receipt.merchantDetails ?? {}
  return {
    transaction_id: transaction.id,
    external_id: `gmail-${email.messageId}`,
    total: receipt.total,
    currency: receipt.currency,
    date: receipt.date,
    merchant: {
      name: receipt.merchant,
      online: true,
      ...(d.email && { email: d.email }),
      ...(d.phone && { phone: d.phone }),
      ...(d.website && { website: d.website }),
      ...(d.address && { address: d.address }),
    },
    items: receipt.items,
    payments: [{ type: 'card', amount: receipt.total, currency: receipt.currency }],
  }
}

export async function submitReceipt(accessToken: string, candidate: MatchCandidate): Promise<void> {
  const payload = buildReceiptPayload(candidate)
  const resp = await fetch('https://api.monzo.com/transaction-receipts', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Receipt submission failed (${resp.status}): ${err}`)
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/monzo/__tests__/receipts.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/monzo/receipts.ts lib/monzo/__tests__/receipts.test.ts
git commit -m "feat: add Monzo Receipts API submission"
```

---

### Task 14: Notifications (Apprise)

**Files:**
- Create: `lib/notifications.ts`
- Create: `lib/__tests__/notifications.test.ts`
- Create: `app/api/notifications/test/route.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/__tests__/notifications.test.ts
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest lib/__tests__/notifications.test.ts
```

- [ ] **Step 3: Implement lib/notifications.ts**

```typescript
// lib/notifications.ts
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
    // Non-fatal — log but don't throw
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
```

- [ ] **Step 4: Run tests**

```bash
npx jest lib/__tests__/notifications.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Create test notification route**

```typescript
// app/api/notifications/test/route.ts
import { NextResponse } from 'next/server'
import { testNotify } from '@/lib/notifications'

export async function POST() {
  const result = await testNotify()
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/notifications.ts lib/__tests__/notifications.test.ts app/api/notifications/
git commit -m "feat: add Apprise notifications"
```

---

### Task 15: Run Orchestrator + SSE

**Files:**
- Create: `lib/runner.ts`
- Create: `app/api/run-match/route.ts`
- Create: `app/api/run-match/status/route.ts`

- [ ] **Step 1: Implement lib/runner.ts**

```typescript
// lib/runner.ts
import db from './db'
import { getConfig, getConfigJson } from './db/queries/config'
import { getLastSuccessfulRun, createRun, updateRun } from './db/queries/runs'
import { getMatchByTransactionId, upsertMatch } from './db/queries/matches'
import { getMonzoAccessToken, getGoogleAccessToken } from './token-refresh'
import { fetchTransactionsSince } from './monzo/transactions'
import { searchReceipts, readEmail } from './gmail/search'
import { extractJsonLdOrder } from './parsing/jsonld'
import { parseEmailWithClaude } from './parsing/claude'
import { matchEmailsToTransactions } from './matching/match'
import { submitReceipt } from './monzo/receipts'
import { notify } from './notifications'
import type { GmailMessage, ParsedReceipt } from './types'

export type SseEvent =
  | { type: 'start'; transactionCount: number }
  | { type: 'progress'; transactionId: string; status: 'submitted' | 'pending_review' | 'no_match' | 'skipped'; merchant: string; amount: number }
  | { type: 'done'; matched: number; needsReview: number; noMatch: number; skipped: number }
  | { type: 'error'; message: string }

export async function runMatch(
  accountIds: string[],
  emit: (event: SseEvent) => void
): Promise<void> {
  const runId = createRun(db)
  const lookbackDays = parseInt(getConfig(db, 'lookback_days') ?? '30', 10)
  const sinceDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const lastRun = getLastSuccessfulRun(db)
  const cursor = lastRun?.cursor_transaction_id ?? undefined

  let matched = 0, needsReview = 0, noMatch = 0, skipped = 0
  let lastTransactionId: string | null = null

  try {
    const monzoToken = await getMonzoAccessToken(db)
    const googleToken = await getGoogleAccessToken(db)

    // Fetch all transactions for selected accounts
    const allTransactions = (
      await Promise.all(accountIds.map(id => fetchTransactionsSince(monzoToken, id, sinceDate, cursor)))
    ).flat()

    // Skip already-processed transactions
    const newTransactions = allTransactions.filter(tx => {
      const existing = getMatchByTransactionId(db, tx.id)
      return !existing || existing.status === 'pending_review'
    })

    emit({ type: 'start', transactionCount: newTransactions.length })

    if (newTransactions.length === 0) {
      updateRun(db, runId, { status: 'done', transactions_scanned: 0, matched: 0, needs_review: 0, no_match: 0 })
      emit({ type: 'done', matched: 0, needsReview: 0, noMatch: 0, skipped: 0 })
      return
    }

    lastTransactionId = newTransactions[newTransactions.length - 1].id

    // Search Gmail for receipts covering the transaction window
    const earliest = newTransactions.reduce((min, tx) => tx.created < min ? tx.created : min, newTransactions[0].created)
    const messageIds = await searchReceipts(googleToken, earliest)

    // Read and parse emails
    const emailsWithReceipts: { email: GmailMessage; receipt: ParsedReceipt }[] = []
    for (const msgId of messageIds) {
      try {
        const email = await readEmail(googleToken, msgId)
        const receipt = extractJsonLdOrder(email.html) ?? await parseEmailWithClaude(email.subject, email.html, email.from)
        if (receipt) emailsWithReceipts.push({ email, receipt })
      } catch {
        // Skip unreadable emails
      }
    }

    // Match
    const candidates = matchEmailsToTransactions(newTransactions, emailsWithReceipts)
    const matchedTransactionIds = new Set(candidates.map(c => c.transaction.id))

    // Submit HIGH confidence, queue MEDIUM for review
    for (const candidate of candidates) {
      if (candidate.confidence === 'high') {
        try {
          await submitReceipt(monzoToken, candidate)
          upsertMatch(db, {
            transaction_id: candidate.transaction.id,
            external_id: `gmail-${candidate.email.messageId}`,
            merchant: candidate.receipt.merchant,
            amount: candidate.receipt.total,
            currency: candidate.receipt.currency,
            status: 'submitted',
            confidence: 'high',
            receipt_data: JSON.stringify(candidate.receipt),
          })
          matched++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'submitted', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        } catch {
          // Submission failed — queue for review
          upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'high', receipt_data: JSON.stringify(candidate.receipt) })
          needsReview++
          emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
        }
      } else {
        upsertMatch(db, { transaction_id: candidate.transaction.id, external_id: `gmail-${candidate.email.messageId}`, merchant: candidate.receipt.merchant, amount: candidate.receipt.total, currency: candidate.receipt.currency, status: 'pending_review', confidence: 'medium', receipt_data: JSON.stringify(candidate.receipt) })
        needsReview++
        emit({ type: 'progress', transactionId: candidate.transaction.id, status: 'pending_review', merchant: candidate.receipt.merchant, amount: candidate.receipt.total })
      }
    }

    // Record no-matches
    for (const tx of newTransactions) {
      if (!matchedTransactionIds.has(tx.id)) {
        const existing = getMatchByTransactionId(db, tx.id)
        if (!existing) {
          upsertMatch(db, { transaction_id: tx.id, external_id: null, merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount), currency: tx.currency, status: 'no_match', confidence: null, receipt_data: null })
          noMatch++
          emit({ type: 'progress', transactionId: tx.id, status: 'no_match', merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount) })
        } else {
          skipped++
          emit({ type: 'progress', transactionId: tx.id, status: 'skipped', merchant: tx.merchant?.name ?? tx.description, amount: Math.abs(tx.amount) })
        }
      }
    }

    updateRun(db, runId, { status: 'done', cursor_transaction_id: lastTransactionId, transactions_scanned: newTransactions.length, matched, needs_review: needsReview, no_match: noMatch })
    emit({ type: 'done', matched, needsReview, noMatch, skipped })

    await notify(`Monzo receipts: ${matched} matched, ${needsReview} need review, ${noMatch} no match`)
    if (needsReview > 0) {
      await notify(`${needsReview} receipt${needsReview > 1 ? 's' : ''} need review — http://localhost:3000/review`)
    }
  } catch (e) {
    updateRun(db, runId, { status: 'error', error_message: String(e) })
    emit({ type: 'error', message: String(e) })
    await notify(`Receipt matching failed: ${String(e)}`)
  }
}
```

- [ ] **Step 2: Create SSE API route**

```typescript
// app/api/run-match/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runMatch, type SseEvent } from '@/lib/runner'

// Track running state globally (single-user app)
let isRunning = false

export async function POST(req: NextRequest) {
  if (isRunning) {
    return NextResponse.json({ error: 'A run is already in progress' }, { status: 409 })
  }

  const { accountIds } = await req.json() as { accountIds: string[] }
  if (!accountIds?.length) {
    return NextResponse.json({ error: 'accountIds required' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  isRunning = true

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        await runMatch(accountIds, emit)
      } finally {
        isRunning = false
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

```typescript
// app/api/run-match/status/route.ts
import { NextResponse } from 'next/server'
import db from '@/lib/db'
import { getLastRun } from '@/lib/db/queries/runs'

export async function GET() {
  const run = getLastRun(db)
  return NextResponse.json({ run })
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/runner.ts app/api/run-match/
git commit -m "feat: add run orchestrator with SSE streaming"
```

---

### Task 16: Settings + Matches API Routes

**Files:**
- Create: `app/api/settings/route.ts`
- Create: `app/api/matches/route.ts`
- Create: `app/api/matches/[id]/route.ts`

- [ ] **Step 1: Create settings route**

```typescript
// app/api/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig, setConfig, getConfigJson, setConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'

export async function GET() {
  const monzoToken = getToken(db, 'monzo')
  const googleToken = getToken(db, 'google')

  return NextResponse.json({
    monzo_client_id: getConfig(db, 'monzo_client_id'),
    monzo_owner_id: getConfig(db, 'monzo_owner_id'),
    schedule_enabled: getConfig(db, 'schedule_enabled') === 'true',
    schedule_cron: getConfig(db, 'schedule_cron') ?? '0 20 * * *',
    schedule_accounts: getConfigJson<string[]>(db, 'schedule_accounts') ?? [],
    lookback_days: parseInt(getConfig(db, 'lookback_days') ?? '30', 10),
    apprise_urls: getConfigJson<string[]>(db, 'apprise_urls') ?? [],
    monzo_connected: !!monzoToken,
    google_connected: !!googleToken,
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>

  if ('schedule_enabled' in body) setConfig(db, 'schedule_enabled', String(body.schedule_enabled))
  if ('schedule_cron' in body) setConfig(db, 'schedule_cron', String(body.schedule_cron))
  if ('schedule_accounts' in body) setConfigJson(db, 'schedule_accounts', body.schedule_accounts)
  if ('lookback_days' in body) setConfig(db, 'lookback_days', String(body.lookback_days))
  if ('apprise_urls' in body) setConfigJson(db, 'apprise_urls', body.apprise_urls)

  // Restart scheduler if schedule settings changed
  if ('schedule_enabled' in body || 'schedule_cron' in body) {
    const { restartScheduler } = await import('@/lib/scheduler')
    restartScheduler()
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create matches routes**

```typescript
// app/api/matches/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatches, getMatchStats } from '@/lib/db/queries/matches'

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10)
  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
  return NextResponse.json({
    matches: getMatches(db, limit, offset),
    stats: getMatchStats(db),
  })
}
```

```typescript
// app/api/matches/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getMatchById, updateMatchStatus } from '@/lib/db/queries/matches'
import { submitReceipt } from '@/lib/monzo/receipts'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import type { MatchStatus, MatchCandidate } from '@/lib/types'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10)
  const { action } = await req.json() as { action: 'approve' | 'skip' }
  const match = getMatchById(db, id)
  if (!match) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'skip') {
    updateMatchStatus(db, id, 'skipped')
    return NextResponse.json({ ok: true })
  }

  if (action === 'approve') {
    if (!match.receipt_data) return NextResponse.json({ error: 'No receipt data' }, { status: 400 })
    try {
      const accessToken = await getMonzoAccessToken(db)
      const receipt = JSON.parse(match.receipt_data)
      // Reconstruct minimal MatchCandidate for submitReceipt
      const candidate: MatchCandidate = {
        transaction: { id: match.transaction_id, amount: -match.amount, currency: match.currency, created: new Date(match.matched_at * 1000).toISOString(), merchant: { name: match.merchant }, description: match.merchant },
        email: { messageId: match.external_id?.replace('gmail-', '') ?? '', subject: '', from: '', date: '', html: '' },
        receipt,
        confidence: match.confidence ?? 'medium',
      }
      await submitReceipt(accessToken, candidate)
      updateMatchStatus(db, id, 'submitted')
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/ app/api/matches/
git commit -m "feat: add settings and matches API routes"
```

---

### Task 17: Scheduler

**Files:**
- Create: `lib/scheduler.ts`
- Create: `instrumentation.ts`

- [ ] **Step 1: Implement lib/scheduler.ts**

```typescript
// lib/scheduler.ts
import cron from 'node-cron'
import db from './db'
import { getConfig, getConfigJson } from './db/queries/config'
import { runMatch } from './runner'

let currentTask: cron.ScheduledTask | null = null

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
  if (!cron.validate(cronExpr)) {
    console.error(`Invalid cron expression: ${cronExpr}`)
    return
  }

  const accountIds = getConfigJson<string[]>(db, 'schedule_accounts') ?? []
  if (accountIds.length === 0) {
    console.warn('Scheduler: no accounts configured, skipping')
    return
  }

  currentTask = cron.schedule(cronExpr, async () => {
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
```

- [ ] **Step 2: Create instrumentation.ts**

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initScheduler } = await import('./lib/scheduler')
    initScheduler()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/scheduler.ts instrumentation.ts
git commit -m "feat: add node-cron scheduler via instrumentation hook"
```

---

### Task 18: /setup Page

**Files:**
- Create: `app/setup/page.tsx`

- [ ] **Step 1: Create /setup page**

```tsx
// app/setup/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const router = useRouter()
  const [form, setForm] = useState({ client_id: '', client_secret: '', owner_id: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monzo_client_id: form.client_id,
          monzo_client_secret: form.client_secret,
          monzo_owner_id: form.owner_id,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/api/auth/monzo')
    } catch (e) {
      setError(String(e))
      setSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-white mb-2">Setup</h1>
        <p className="text-slate-400 text-sm mb-8">
          Enter your Monzo OAuth client credentials. Create a client at{' '}
          <a href="https://developers.monzo.com" target="_blank" className="text-sky-400 underline">developers.monzo.com</a>{' '}
          with redirect URL <code className="text-slate-300">http://localhost:3000/api/auth/monzo/callback</code> and type <strong>Confidential</strong>.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Client ID', key: 'client_id', placeholder: 'oauth2client_...' },
            { label: 'Client Secret', key: 'client_secret', placeholder: '' },
            { label: 'Owner ID', key: 'owner_id', placeholder: 'user_...' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-sm text-slate-300 mb-1">{label}</label>
              <input
                type={key === 'client_secret' ? 'password' : 'text'}
                value={form[key as keyof typeof form]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500"
              />
            </div>
          ))}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save & Connect Monzo'}
          </button>
        </form>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/setup/page.tsx
git commit -m "feat: add /setup first-run page"
```

---

### Task 19: Shared Components

**Files:**
- Create: `components/AccountMultiSelect.tsx`
- Create: `components/ConnectionBadge.tsx`

- [ ] **Step 1: Create AccountMultiSelect**

```tsx
// components/AccountMultiSelect.tsx
interface Account { id: string; description: string; type: string }

interface Props {
  accounts: Account[]
  selected: string[]
  onChange: (ids: string[]) => void
}

export default function AccountMultiSelect({ accounts, selected, onChange }: Props) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700">
      {accounts.map(account => (
        <label
          key={account.id}
          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-700/50 border-b border-slate-700 last:border-0"
        >
          <div
            className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
              selected.includes(account.id) ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            {selected.includes(account.id) && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-slate-200 flex-1">{account.description}</span>
          <span className="text-xs text-slate-500">{account.type}</span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create ConnectionBadge**

```tsx
// components/ConnectionBadge.tsx
interface Props { label: string; connected: boolean; onReconnect: () => void }

export default function ConnectionBadge({ label, connected, onReconnect }: Props) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${connected ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      {label}
      {!connected && (
        <button onClick={onReconnect} className="ml-1 text-sky-400 hover:text-sky-300 underline">
          Connect
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/AccountMultiSelect.tsx components/ConnectionBadge.tsx
git commit -m "feat: add shared AccountMultiSelect and ConnectionBadge components"
```

---

### Task 20: Dashboard Page

**Files:**
- Create: `components/dashboard/StatsRow.tsx`
- Create: `components/dashboard/RunControls.tsx`
- Create: `components/dashboard/ScheduleStatus.tsx`
- Create: `components/dashboard/LastRunResults.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create StatsRow**

```tsx
// components/dashboard/StatsRow.tsx
interface Props { total: number; submitted: number; pendingReview: number; noMatch: number }

export default function StatsRow({ total, submitted, pendingReview, noMatch }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Transactions', value: total, color: 'text-white' },
        { label: 'Matched', value: submitted, color: 'text-emerald-400' },
        { label: 'Needs Review', value: pendingReview, color: 'text-amber-400' },
        { label: 'No Receipt', value: noMatch, color: 'text-slate-500' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-slate-800 rounded-xl p-4 text-center">
          <div className={`text-2xl font-bold ${color}`}>{value}</div>
          <div className="text-xs text-slate-500 mt-1">{label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create RunControls**

```tsx
// components/dashboard/RunControls.tsx
'use client'
import { useState } from 'react'
import AccountMultiSelect from '@/components/AccountMultiSelect'

interface Account { id: string; description: string; type: string }
interface SseEvent { type: string; [key: string]: unknown }

interface Props {
  accounts: Account[]
  defaultSelected: string[]
  onRunComplete: () => void
}

export default function RunControls({ accounts, defaultSelected, onRunComplete }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultSelected)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])

  async function startRun() {
    if (!selected.length) return
    setRunning(true)
    setLog([])

    const resp = await fetch('/api/run-match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountIds: selected }),
    })

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data:'))
      for (const line of lines) {
        const event = JSON.parse(line.slice(5).trim()) as SseEvent
        if (event.type === 'progress') {
          setLog(l => [...l, `${event.status === 'submitted' ? '✓' : event.status === 'pending_review' ? '?' : '–'} ${event.merchant} £${((event.amount as number) / 100).toFixed(2)}`])
        }
        if (event.type === 'done' || event.type === 'error') {
          setRunning(false)
          onRunComplete()
        }
      }
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-400 mb-2">Accounts to scan</p>
          <AccountMultiSelect accounts={accounts} selected={selected} onChange={setSelected} />
        </div>
        <button
          onClick={startRun}
          disabled={running || !selected.length}
          className="mt-6 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-lg px-5 py-2 text-sm transition-colors whitespace-nowrap"
        >
          {running ? 'Running…' : '▶ Run Now'}
        </button>
      </div>
      {log.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto">
          {log.map((l, i) => <p key={i} className="text-xs text-slate-300 font-mono">{l}</p>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create ScheduleStatus**

```tsx
// components/dashboard/ScheduleStatus.tsx
import Link from 'next/link'

interface Props { enabled: boolean; cronExpr: string; appriseUrls: string[] }

function nextRunLabel(cron: string): string {
  if (cron === '0 20 * * *') return 'Daily at 8pm'
  if (cron === '0 * * * *') return 'Hourly'
  if (cron === '0 */6 * * *') return 'Every 6 hours'
  return cron
}

export default function ScheduleStatus({ enabled, cronExpr, appriseUrls }: Props) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-700">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-sky-400">⏱</span>
        {enabled ? (
          <span className="text-slate-300">
            Auto-run: <span className="text-white">{nextRunLabel(cronExpr)}</span>
            {appriseUrls.length > 0 && <span className="text-slate-500 ml-2">· 🔔 {appriseUrls.length} notification{appriseUrls.length > 1 ? 's' : ''}</span>}
          </span>
        ) : (
          <span className="text-slate-500">Auto-run disabled</span>
        )}
      </div>
      <Link href="/settings" className="text-xs text-slate-500 hover:text-slate-300">Configure ›</Link>
    </div>
  )
}
```

- [ ] **Step 4: Create LastRunResults**

```tsx
// components/dashboard/LastRunResults.tsx
import Link from 'next/link'
import type { MatchRow } from '@/lib/db/queries/matches'

interface RunSummary { completedAt: number; transactionsScanned: number; matched: number; needsReview: number }
interface Props { run: RunSummary | null; recentMatches: MatchRow[]; pendingCount: number }

export default function LastRunResults({ run, recentMatches, pendingCount }: Props) {
  if (!run) return <div className="bg-slate-800 rounded-xl p-4 text-sm text-slate-500">No runs yet — click Run Now to start.</div>

  const date = new Date(run.completedAt * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="bg-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">Last Run — {date}</p>
          <p className="text-xs text-slate-500">{run.transactionsScanned} transactions scanned</p>
        </div>
        {pendingCount > 0 && (
          <Link href="/review" className="bg-amber-950 text-amber-400 px-3 py-1 rounded-lg text-xs hover:bg-amber-900 transition-colors">
            Review {pendingCount} ›
          </Link>
        )}
      </div>
      <div className="space-y-1.5">
        {recentMatches.slice(0, 8).map(m => (
          <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${m.status === 'pending_review' ? 'bg-amber-950/30 border border-amber-900/50' : 'bg-slate-900'}`}>
            <div className="flex items-center gap-2">
              <span className={m.status === 'submitted' ? 'text-emerald-400' : m.status === 'pending_review' ? 'text-amber-400' : 'text-slate-600'}>
                {m.status === 'submitted' ? '✓' : m.status === 'pending_review' ? '?' : '–'}
              </span>
              <span className="text-slate-200">{m.merchant}</span>
              {m.status === 'pending_review' && <span className="text-xs text-slate-500">· needs review</span>}
            </div>
            <span className="text-slate-400 text-xs">£{(m.amount / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Assemble Dashboard page**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'
import { getMatchStats, getMatches, getPendingReviewMatches } from '@/lib/db/queries/matches'
import { getLastSuccessfulRun, getLastRun } from '@/lib/db/queries/runs'
import { fetchAccounts } from '@/lib/monzo/accounts'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import StatsRow from '@/components/dashboard/StatsRow'
import RunControls from '@/components/dashboard/RunControls'
import ScheduleStatus from '@/components/dashboard/ScheduleStatus'
import LastRunResults from '@/components/dashboard/LastRunResults'
import ConnectionBadge from '@/components/ConnectionBadge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!getConfig(db, 'monzo_client_id')) redirect('/setup')

  const monzoConnected = !!getToken(db, 'monzo')
  const googleConnected = !!getToken(db, 'google')
  const stats = getMatchStats(db)
  const lastRun = getLastRun(db)
  const recentMatches = getMatches(db, 10, 0)
  const pendingReviews = getPendingReviewMatches(db)
  const scheduleEnabled = getConfig(db, 'schedule_enabled') === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron') ?? '0 20 * * *'
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls') ?? []
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts') ?? []

  let accounts: { id: string; description: string; type: string }[] = []
  if (monzoConnected) {
    try {
      const token = await getMonzoAccessToken(db)
      accounts = await fetchAccounts(token)
    } catch { /* token expired — show reconnect */ }
  }

  const lastRunSummary = lastRun?.status === 'done' ? {
    completedAt: lastRun.completed_at!,
    transactionsScanned: lastRun.transactions_scanned,
    matched: lastRun.matched,
    needsReview: lastRun.needs_review,
  } : null

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Monzo Receipt Matching</h1>
            {lastRun && <p className="text-xs text-slate-500 mt-0.5">Last synced: {new Date(lastRun.started_at * 1000).toLocaleString('en-GB')} · cursor saved</p>}
          </div>
          <div className="flex items-center gap-2">
            <ConnectionBadge label="Monzo" connected={monzoConnected} onReconnect={() => window.location.href = '/api/auth/monzo'} />
            <ConnectionBadge label="Gmail" connected={googleConnected} onReconnect={() => window.location.href = '/api/auth/google'} />
            <Link href="/settings" className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg px-2.5 py-1.5 text-sm transition-colors">⚙</Link>
          </div>
        </div>

        <StatsRow total={stats.total} submitted={stats.submitted} pendingReview={stats.pending_review} noMatch={stats.no_match} />

        <div className="bg-slate-800 rounded-xl p-4 space-y-4">
          <RunControls accounts={accounts} defaultSelected={savedAccounts} onRunComplete={() => {}} />
          <ScheduleStatus enabled={scheduleEnabled} cronExpr={scheduleCron} appriseUrls={appriseUrls} />
        </div>

        <LastRunResults run={lastRunSummary} recentMatches={recentMatches} pendingCount={pendingReviews.length} />
      </div>
    </main>
  )
}
```

Note: `RunControls` is a Client Component (has `'use client'`) but `DashboardPage` is a Server Component. The page passes serialisable props from the server to `RunControls`. The `onRunComplete` callback passed from the server page needs to be a client-side refresh — update `app/page.tsx` to wrap `RunControls` in a thin client wrapper:

```tsx
// components/dashboard/RunControlsWrapper.tsx
'use client'
import { useRouter } from 'next/navigation'
import RunControls from './RunControls'

interface Account { id: string; description: string; type: string }
interface Props { accounts: Account[]; defaultSelected: string[] }

export default function RunControlsWrapper({ accounts, defaultSelected }: Props) {
  const router = useRouter()
  return <RunControls accounts={accounts} defaultSelected={defaultSelected} onRunComplete={() => router.refresh()} />
}
```

Update `app/page.tsx` to use `RunControlsWrapper` instead of `RunControls` directly.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/ components/ConnectionBadge.tsx app/page.tsx
git commit -m "feat: add dashboard page and components"
```

---

### Task 21: Settings Page

**Files:**
- Create: `components/settings/ConnectionsSection.tsx`
- Create: `components/settings/ScheduleSection.tsx`
- Create: `components/settings/NotificationsSection.tsx`
- Create: `app/settings/page.tsx`

- [ ] **Step 1: Create ConnectionsSection**

```tsx
// components/settings/ConnectionsSection.tsx
interface Props { monzoConnected: boolean; googleConnected: boolean }

export default function ConnectionsSection({ monzoConnected, googleConnected }: Props) {
  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Connections</h2>
      <div className="bg-slate-800 rounded-xl overflow-hidden divide-y divide-slate-700">
        {[
          { label: 'Monzo', connected: monzoConnected, href: '/api/auth/monzo' },
          { label: 'Gmail', connected: googleConnected, href: '/api/auth/google' },
        ].map(({ label, connected, href }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-white">{label}</p>
              <p className={`text-xs mt-0.5 ${connected ? 'text-emerald-400' : 'text-slate-500'}`}>
                {connected ? 'Connected' : 'Not connected'}
              </p>
            </div>
            <a href={href} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
              {connected ? 'Reconnect' : 'Connect'}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create ScheduleSection**

```tsx
// components/settings/ScheduleSection.tsx
'use client'
import { useState } from 'react'
import AccountMultiSelect from '@/components/AccountMultiSelect'

const PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 8pm', value: '0 20 * * *' },
  { label: 'Custom', value: 'custom' },
]
const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90]

interface Account { id: string; description: string; type: string }
interface Props {
  enabled: boolean; cronExpr: string; accounts: Account[]
  selectedAccounts: string[]; lookbackDays: number
}

export default function ScheduleSection({ enabled, cronExpr, accounts, selectedAccounts, lookbackDays }: Props) {
  const [form, setForm] = useState({ enabled, cronExpr, selectedAccounts, lookbackDays })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isCustom = !PRESETS.slice(0, -1).find(p => p.value === form.cronExpr)

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: form.enabled, schedule_cron: form.cronExpr, schedule_accounts: form.selectedAccounts, lookback_days: form.lookbackDays }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Schedule</h2>
      <div className="bg-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white">Auto-run enabled</span>
          <button
            onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
            className={`w-10 h-5 rounded-full relative transition-colors ${form.enabled ? 'bg-sky-500' : 'bg-slate-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.enabled ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Frequency</span>
          <select
            value={isCustom ? 'custom' : form.cronExpr}
            onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value === 'custom' ? '' : e.target.value }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Custom cron expression</label>
            <input
              value={form.cronExpr}
              onChange={e => setForm(f => ({ ...f, cronExpr: e.target.value }))}
              placeholder="0 20 * * *"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono"
            />
          </div>
        )}

        <div>
          <p className="text-sm text-slate-400 mb-2">Accounts to scan</p>
          <AccountMultiSelect accounts={accounts} selected={form.selectedAccounts} onChange={ids => setForm(f => ({ ...f, selectedAccounts: ids }))} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Lookback window</span>
          <select
            value={form.lookbackDays}
            onChange={e => setForm(f => ({ ...f, lookbackDays: Number(e.target.value) }))}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            {LOOKBACK_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>

        <button onClick={save} disabled={saving} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2 transition-colors">
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create NotificationsSection**

```tsx
// components/settings/NotificationsSection.tsx
'use client'
import { useState } from 'react'

interface Props { appriseUrls: string[] }

export default function NotificationsSection({ appriseUrls }: Props) {
  const [urls, setUrls] = useState(appriseUrls.join('\n'))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  async function save() {
    setSaving(true)
    const parsed = urls.split('\n').map(u => u.trim()).filter(Boolean)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apprise_urls: parsed }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    const res = await fetch('/api/notifications/test', { method: 'POST' })
    setTestResult(await res.json())
    setTesting(false)
  }

  return (
    <section>
      <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notifications (Apprise)</h2>
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-xs text-slate-500">One Apprise URL per line. Fired on run complete, needs review, and errors. Requires <code className="text-slate-300">pip install apprise</code>.</p>
        <textarea
          value={urls}
          onChange={e => setUrls(e.target.value)}
          rows={4}
          placeholder={'slack://token/channel\nntfy://mytopic\ndiscord://webhook_id/token'}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono resize-none focus:outline-none focus:border-sky-500"
        />
        <div className="flex items-center justify-between">
          <button onClick={sendTest} disabled={testing} className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50">
            {testing ? 'Sending…' : 'Send test notification'}
          </button>
          <button onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-1.5 transition-colors">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {testResult && (
          <p className={`text-xs ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.success ? '✓ Test notification sent' : `✗ ${testResult.error}`}
          </p>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Assemble Settings page**

```tsx
// app/settings/page.tsx
import db from '@/lib/db'
import { getConfig, getConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'
import { getMonzoAccessToken } from '@/lib/token-refresh'
import { fetchAccounts } from '@/lib/monzo/accounts'
import ConnectionsSection from '@/components/settings/ConnectionsSection'
import ScheduleSection from '@/components/settings/ScheduleSection'
import NotificationsSection from '@/components/settings/NotificationsSection'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const monzoConnected = !!getToken(db, 'monzo')
  const googleConnected = !!getToken(db, 'google')
  const scheduleEnabled = getConfig(db, 'schedule_enabled') === 'true'
  const scheduleCron = getConfig(db, 'schedule_cron') ?? '0 20 * * *'
  const savedAccounts = getConfigJson<string[]>(db, 'schedule_accounts') ?? []
  const lookbackDays = parseInt(getConfig(db, 'lookback_days') ?? '30', 10)
  const appriseUrls = getConfigJson<string[]>(db, 'apprise_urls') ?? []

  let accounts: { id: string; description: string; type: string }[] = []
  if (monzoConnected) {
    try {
      const token = await getMonzoAccessToken(db)
      accounts = await fetchAccounts(token)
    } catch { /* token expired */ }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Dashboard</Link>
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>
        <ConnectionsSection monzoConnected={monzoConnected} googleConnected={googleConnected} />
        <ScheduleSection enabled={scheduleEnabled} cronExpr={scheduleCron} accounts={accounts} selectedAccounts={savedAccounts} lookbackDays={lookbackDays} />
        <NotificationsSection appriseUrls={appriseUrls} />
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/settings/ app/settings/page.tsx
git commit -m "feat: add settings page and components"
```

---

### Task 22: Review Page

**Files:**
- Create: `components/review/ReviewModal.tsx`
- Create: `app/review/page.tsx`

- [ ] **Step 1: Create ReviewModal**

```tsx
// components/review/ReviewModal.tsx
'use client'
import { useState } from 'react'
import type { MatchRow } from '@/lib/db/queries/matches'

interface Props {
  match: MatchRow
  total: number
  current: number
  onApprove: (id: number) => Promise<void>
  onSkip: (id: number) => Promise<void>
}

export default function ReviewModal({ match, total, current, onApprove, onSkip }: Props) {
  const [acting, setActing] = useState<'approve' | 'skip' | null>(null)
  const receipt = match.receipt_data ? JSON.parse(match.receipt_data) : null

  async function handle(action: 'approve' | 'skip') {
    setActing(action)
    if (action === 'approve') await onApprove(match.id)
    else await onSkip(match.id)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Review Match</h2>
          <span className="text-xs text-slate-500">{current} of {total}</span>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Transaction</p>
              <p className="text-sm font-medium text-white">{match.merchant}</p>
              <p className="text-sm text-amber-400">£{(match.amount / 100).toFixed(2)}</p>
              <p className="text-xs text-slate-500 mt-1">{new Date(match.matched_at * 1000).toLocaleDateString('en-GB')}</p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Email receipt</p>
              {receipt ? (
                <>
                  <p className="text-sm font-medium text-white">{receipt.merchant}</p>
                  <p className="text-sm text-amber-400">£{(receipt.total / 100).toFixed(2)}</p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(receipt.date).toLocaleDateString('en-GB')}</p>
                </>
              ) : <p className="text-xs text-slate-500">No receipt data</p>}
            </div>
          </div>
          {receipt?.items?.length > 0 && (
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-2">Line items</p>
              <div className="space-y-1">
                {receipt.items.map((item: { description: string; amount: number; quantity: number }, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-300">{item.description}</span>
                    <span className="text-slate-400">£{(item.amount / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Confidence: <span className="text-amber-400">{match.confidence}</span>
            {match.confidence === 'medium' && ' — date offset or merchant name mismatch'}
          </p>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={() => handle('skip')}
            disabled={!!acting}
            className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 text-sm font-medium rounded-xl py-2.5 transition-colors"
          >
            {acting === 'skip' ? 'Skipping…' : 'Skip'}
          </button>
          <button
            onClick={() => handle('approve')}
            disabled={!!acting}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-xl py-2.5 transition-colors"
          >
            {acting === 'approve' ? 'Submitting…' : 'Approve & Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create Review page**

```tsx
// app/review/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ReviewModal from '@/components/review/ReviewModal'
import type { MatchRow } from '@/lib/db/queries/matches'

export default function ReviewPage() {
  const router = useRouter()
  const [pending, setPending] = useState<MatchRow[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/matches?limit=100')
      .then(r => r.json())
      .then(d => {
        setPending((d.matches as MatchRow[]).filter(m => m.status === 'pending_review'))
        setLoading(false)
      })
  }, [])

  async function handleApprove(id: number) {
    await fetch(`/api/matches/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
    advance()
  }

  async function handleSkip(id: number) {
    await fetch(`/api/matches/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'skip' }) })
    advance()
  }

  function advance() {
    if (index + 1 >= pending.length) router.push('/')
    else setIndex(i => i + 1)
  }

  if (loading) return <main className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400">Loading…</p></main>
  if (pending.length === 0) return <main className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400">No matches to review. <a href="/" className="text-sky-400 underline">Back to dashboard</a></p></main>

  return (
    <main className="min-h-screen bg-slate-950">
      <ReviewModal
        match={pending[index]}
        total={pending.length}
        current={index + 1}
        onApprove={handleApprove}
        onSkip={handleSkip}
      />
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/review/ app/review/page.tsx
git commit -m "feat: add review page with modal approve/skip flow"
```

---

### Task 23: Root Layout + Final Wiring

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/api/settings/route.ts` (add monzo_client_id save for /setup flow)

- [ ] **Step 1: Update root layout**

```tsx
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Monzo Receipt Matching',
  description: 'Match Gmail receipts to Monzo transactions',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-950 text-white antialiased`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Add monzo credentials to settings PUT handler**

In `app/api/settings/route.ts`, inside the `PUT` handler, add before the scheduler restart block:

```typescript
if ('monzo_client_id' in body) setConfig(db, 'monzo_client_id', String(body.monzo_client_id))
if ('monzo_client_secret' in body) setConfig(db, 'monzo_client_secret', String(body.monzo_client_secret))
if ('monzo_owner_id' in body) setConfig(db, 'monzo_owner_id', String(body.monzo_owner_id))
```

- [ ] **Step 3: Verify app starts**

```bash
npm run dev
```

Open http://localhost:3000. Expected: redirects to /setup (no config yet). Fill in credentials → redirects to Monzo OAuth.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx app/api/settings/route.ts
git commit -m "feat: final layout and settings wiring"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Next.js 14 App Router | Task 1 |
| SQLite with better-sqlite3 | Tasks 2–4 |
| Monzo OAuth callback flow | Task 5 |
| Google OAuth + Gmail API | Tasks 6, 9 |
| Token refresh (5-min window) | Task 7 |
| Monzo accounts + transactions (cursor-paginated) | Task 8 |
| JSON-LD extraction | Task 10 |
| Claude API fallback parser | Task 11 |
| Match algorithm + HIGH/MEDIUM confidence | Task 12 |
| Monzo Receipts API submission | Task 13 |
| Apprise notifications | Task 14 |
| Run orchestrator + SSE streaming | Task 15 |
| Settings API (GET/PUT) | Task 16 |
| Matches API (GET + PUT approve/skip) | Task 16 |
| node-cron scheduler via instrumentation.ts | Task 17 |
| /setup first-run page | Task 18 |
| AccountMultiSelect (multi-select accounts) | Task 19 |
| Dashboard with stats, run controls, schedule status | Task 20 |
| Settings page: connections + schedule + notifications | Task 21 |
| Review page: modal approve/skip | Task 22 |
| First-run cursor fallback to lookback_days | Task 15 (runner.ts) |
| Idempotency via external_id | Task 15 (runner.ts) |
| Notification on needs-review + run complete | Task 15 (runner.ts) |

All spec requirements covered. ✓
