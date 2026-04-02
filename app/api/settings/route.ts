// app/api/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { getConfig, setConfig, getConfigJson, setConfigJson } from '@/lib/db/queries/config'
import { getToken } from '@/lib/db/queries/tokens'
import { requireSession } from '@/lib/auth/session'
import { restartSchedulerForUser } from '@/lib/scheduler'

function getSession(req: NextRequest) {
  return requireSession(db, req.headers.get('x-session-token') ?? undefined)
}

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.userId

  const monzoToken = getToken(db, 'monzo', uid)
  const googleToken = getToken(db, 'google', uid)

  return NextResponse.json({
    monzo_client_id: getConfig(db, 'monzo_client_id'),          // global
    monzo_owner_id: getConfig(db, 'monzo_owner_id', uid),
    schedule_enabled: getConfig(db, 'schedule_enabled', uid) === 'true',
    schedule_cron: getConfig(db, 'schedule_cron', uid) ?? '0 20 * * *',
    schedule_accounts: getConfigJson<string[]>(db, 'schedule_accounts', uid) ?? [],
    lookback_days: parseInt(getConfig(db, 'lookback_days', uid) ?? '30', 10),
    apprise_urls: getConfigJson<string[]>(db, 'apprise_urls', uid) ?? [],
    only_online_transactions: getConfig(db, 'only_online_transactions', uid) === 'true',
    monzo_connected: !!monzoToken,
    google_connected: !!googleToken,
  })
}

export async function PUT(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.userId

  const body = await req.json() as Record<string, unknown>
  let scheduleChanged = false

  // Global keys (no userId)
  if ('monzo_client_id' in body) setConfig(db, 'monzo_client_id', String(body.monzo_client_id))
  if ('monzo_client_secret' in body) setConfig(db, 'monzo_client_secret', String(body.monzo_client_secret))

  // Per-user keys
  if ('monzo_owner_id' in body) setConfig(db, 'monzo_owner_id', String(body.monzo_owner_id), uid)
  if ('schedule_enabled' in body) { setConfig(db, 'schedule_enabled', String(body.schedule_enabled), uid); scheduleChanged = true }
  if ('schedule_cron' in body) { setConfig(db, 'schedule_cron', String(body.schedule_cron), uid); scheduleChanged = true }
  if ('schedule_accounts' in body) setConfigJson(db, 'schedule_accounts', body.schedule_accounts, uid)
  if ('lookback_days' in body) setConfig(db, 'lookback_days', String(body.lookback_days), uid)
  if ('apprise_urls' in body) setConfigJson(db, 'apprise_urls', body.apprise_urls, uid)
  if ('only_online_transactions' in body) setConfig(db, 'only_online_transactions', String(body.only_online_transactions), uid)

  if (scheduleChanged) restartSchedulerForUser(uid)

  return NextResponse.json({ ok: true })
}
