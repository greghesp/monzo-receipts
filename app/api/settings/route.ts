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
    only_online_transactions: getConfig(db, 'only_online_transactions') === 'true',
    monzo_connected: !!monzoToken,
    google_connected: !!googleToken,
  })
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>

  if ('monzo_client_id' in body) setConfig(db, 'monzo_client_id', String(body.monzo_client_id))
  if ('monzo_client_secret' in body) setConfig(db, 'monzo_client_secret', String(body.monzo_client_secret))
  if ('monzo_owner_id' in body) setConfig(db, 'monzo_owner_id', String(body.monzo_owner_id))
  if ('schedule_enabled' in body) setConfig(db, 'schedule_enabled', String(body.schedule_enabled))
  if ('schedule_cron' in body) setConfig(db, 'schedule_cron', String(body.schedule_cron))
  if ('schedule_accounts' in body) setConfigJson(db, 'schedule_accounts', body.schedule_accounts)
  if ('lookback_days' in body) setConfig(db, 'lookback_days', String(body.lookback_days))
  if ('apprise_urls' in body) setConfigJson(db, 'apprise_urls', body.apprise_urls)
  if ('only_online_transactions' in body) setConfig(db, 'only_online_transactions', String(body.only_online_transactions))

  if ('schedule_enabled' in body || 'schedule_cron' in body) {
    const { restartScheduler } = await import('@/lib/scheduler')
    restartScheduler()
  }

  return NextResponse.json({ ok: true })
}
