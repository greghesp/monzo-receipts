# Monzo Receipt Matching App — Design Spec

**Date:** 2026-03-29
**Status:** Approved

---

## Overview

A locally-run Next.js web app that automates matching Gmail receipt emails to Monzo bank transactions and submits itemised receipt data to the Monzo Receipts API. The result is line-item receipts appearing natively inside the Monzo app.

The app replaces the Claude Code skill workflow with a persistent, self-contained UI that can run on a schedule without any manual intervention.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14, App Router, TypeScript |
| Database | SQLite via `better-sqlite3`, at `~/.monzo-receipts/db.sqlite` |
| Scheduler | `node-cron` running inside the Next.js server process |
| Notifications | `apprise` CLI (Python), invoked via `child_process.execFile` |
| Email parsing | Claude API (`claude-haiku-4-5`) via `@anthropic-ai/sdk` — fallback when JSON-LD absent |
| Monzo auth | OAuth2 with standard callback to `localhost:3000/api/auth/monzo/callback` |
| Gmail auth | Google OAuth2 + Gmail API, callback to `localhost:3000/api/auth/google/callback` |

---

## Pages

```
/           Dashboard — stats, run controls, schedule status, last run results
/settings   Connections, Schedule config, Apprise notifications
/review     Modal-driven review of pending_review matches
/setup      First-run wizard for Monzo OAuth client credentials
```

### Dashboard (`/`)

- **Header:** app title + "Last synced: <date> · cursor saved" + Monzo/Gmail connection status badges + gear icon linking to `/settings`
- **Stats row:** Transactions scanned · Matched · Needs Review · No Receipt (cumulative totals across all runs)
- **Run controls:**
  - Multi-select account picker (populated from Monzo on first auth, cached in config). Pre-selects `schedule_accounts` from config by default; selection can be changed per ad-hoc run without affecting the saved schedule config
  - "Run Now" button — triggers a match run, streams SSE progress inline
  - Schedule status (read-only): frequency, next run time, active notification targets, "Configure ›" link
- **Last run results:** run timestamp, "X new transactions since cursor", results list (✓ submitted / ? pending review / – no match), "Review N ›" badge if any pending

### Settings (`/settings`)

Three sections:

**Connections**
- Monzo: connected state + account name, Reconnect button
- Gmail: connected state + email address, Reconnect button

**Schedule**
- Auto-run enabled toggle
- Frequency dropdown (options: hourly, every 6h, daily at 8pm, custom cron)
- Accounts to scan — multi-select checkbox list (same dynamic list as dashboard)
- Lookback window dropdown (7 / 14 / 30 / 60 / 90 days)

**Notifications (Apprise)**
- Textarea: one Apprise URL per line (e.g. `slack://token/channel`, `ntfy://topic`)
- Fires on: run complete, items need review, errors
- "Send test notification" button
- Save button

### Review (`/review`)

Modal-driven flow for `pending_review` matches. Each modal shows:
- Transaction side: merchant name, amount, date, account
- Email side: sender, subject, date, extracted items
- Confidence reason (e.g. "date offset +1 day")
- Actions: Approve (submit to Monzo + mark submitted) · Skip (mark skipped)
- Progress indicator: "2 of 3 reviewed"

### Setup (`/setup`)

Shown on first run when `monzo_client_id` is absent from config. Form fields:
- Monzo Client ID (prefixed `oauth2client_`)
- Monzo Client Secret
- Monzo Owner ID (prefixed `user_`)

On submit: saves to SQLite, redirects to `/api/auth/monzo` to begin OAuth.

---

## API Routes

```
GET  /api/auth/monzo                 Redirect to Monzo OAuth URL
GET  /api/auth/monzo/callback        Exchange code → token, save to DB
GET  /api/auth/google                Redirect to Google OAuth URL
GET  /api/auth/google/callback       Exchange code → token, save to DB

POST /api/run-match                  Start a matching run; streams SSE progress
GET  /api/run-match/status           Current run status (polling fallback)

GET  /api/matches                    Paginated match history
PUT  /api/matches/:id                Approve or skip a pending_review match

GET  /api/settings                   Load all config values
PUT  /api/settings                   Save config values

POST /api/notifications/test         Fire a test Apprise notification
```

---

## Data Model

### `config` table
Key/value store. Keys:

| Key | Type | Description |
|---|---|---|
| `monzo_client_id` | string | OAuth client ID |
| `monzo_client_secret` | string | OAuth client secret |
| `monzo_owner_id` | string | Monzo user ID (`user_...`) |
| `schedule_enabled` | boolean | Auto-run on/off |
| `schedule_cron` | string | cron expression (e.g. `0 20 * * *`) |
| `schedule_accounts` | JSON array | Account IDs to scan on scheduled runs |
| `lookback_days` | integer | Default scan window in days |
| `apprise_urls` | JSON array | Notification URLs |

### `tokens` table

| Column | Type |
|---|---|
| `provider` | TEXT PRIMARY KEY (`monzo` \| `google`) |
| `access_token` | TEXT |
| `refresh_token` | TEXT |
| `expires_at` | INTEGER (Unix timestamp) |

### `matches` table

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY |
| `transaction_id` | TEXT UNIQUE |
| `external_id` | TEXT UNIQUE (`gmail-<messageId>`) |
| `merchant` | TEXT |
| `amount` | INTEGER (pence) |
| `currency` | TEXT DEFAULT `GBP` |
| `status` | TEXT (`submitted` \| `skipped` \| `pending_review` \| `no_match`) |
| `confidence` | TEXT (`high` \| `medium`) |
| `receipt_data` | TEXT (JSON blob of full Monzo receipt payload) |
| `matched_at` | INTEGER (Unix timestamp) |

### `runs` table

| Column | Type |
|---|---|
| `id` | INTEGER PRIMARY KEY |
| `started_at` | INTEGER |
| `completed_at` | INTEGER |
| `status` | TEXT (`running` \| `done` \| `error`) |
| `cursor_transaction_id` | TEXT (saved at run end; next run fetches newer than this) |
| `transactions_scanned` | INTEGER |
| `matched` | INTEGER |
| `needs_review` | INTEGER |
| `no_match` | INTEGER |
| `error_message` | TEXT |

---

## Matching Run Flow

Triggered by manual "Run Now" or the `node-cron` scheduler.

1. **Load cursor** — query the last successful `runs` row for `cursor_transaction_id`. If no prior run exists (first run), fall back to fetching transactions from `now - lookback_days`
2. **Fetch transactions** — Monzo API, filtered to selected accounts, newer than cursor (or since lookback date), cursor-paginated (100/page)
3. **Search Gmail** — receipt-style emails (`subject:(order OR receipt OR confirmation OR invoice)`) since the earliest transaction date in the batch; fetch up to 200 results
4. **Extract email data** — try JSON-LD `Order` object first; fall back to Claude API (Anthropic SDK, `claude-haiku-4-5` for cost efficiency) to extract structured line-item data from email HTML/text
5. **Match** — for each email, find best Monzo debit: exact amount (pence), date ±1 day, fuzzy merchant name
   - HIGH confidence → submit to Monzo Receipts API immediately, record `submitted`
   - MEDIUM confidence → record `pending_review`, do not submit
   - No match → record `no_match`
6. **Save cursor** — store last transaction ID from batch in `runs` row
7. **Notify** — fire Apprise: "Run complete — X matched, Y need review"
   - If any `pending_review`: additional notification with link to `/review`

**SSE streaming:** SSE events are emitted throughout steps 2–5 (one event per transaction processed), not as a final step. The dashboard consumes these to show live progress during a run.

**Idempotency:** `external_id = "gmail-<messageId>"` is sent to the Monzo Receipts API. Re-submitting the same `external_id` updates rather than duplicates. Already-submitted `transaction_id`s in the `matches` table are silently skipped on future runs.

---

## Token Refresh

Before every Monzo or Google API call:
- Check `expires_at` — if expired or within 5 minutes, use `refresh_token` to get a new access token
- Save the new token to the `tokens` table
- If refresh fails (revoked, expired refresh token): mark connection as disconnected, abort the run, fire an Apprise error notification

---

## Notifications (Apprise)

The `apprise` Python CLI must be installed (`pip install apprise`). The app invokes it as:

```bash
apprise -b "message" "url1" "url2"
```

Notification events:
- **Run complete:** `"Monzo receipts: 12 matched, 3 need review, 2 no match"`
- **Needs review:** `"3 receipts need review — localhost:3000/review"`
- **Error:** `"Receipt matching failed: <error_message>"`
- **Test:** `"Monzo Receipt Matching — test notification"`

---

## Scheduling

`node-cron` is initialised once when the Next.js server starts. It reads `schedule_enabled` and `schedule_cron` from SQLite. When settings change, the cron job is cancelled and recreated with the new expression. Supported presets and their cron expressions:

| Preset | Cron |
|---|---|
| Hourly | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Daily at 8pm | `0 20 * * *` |
| Custom | user-entered cron string |

---

## Out of Scope

- Multi-user support (this is a single-user local tool)
- Deployment beyond `localhost`
- Receipt deletion / undo (Monzo Receipts API is PUT-based; idempotency handles re-runs)
- Automatic token refresh for Monzo beyond what the OAuth spec provides (Monzo tokens have a short TTL; reconnecting is the fallback)
