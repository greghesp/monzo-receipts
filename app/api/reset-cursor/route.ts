import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function POST() {
  db.prepare('DELETE FROM runs').run()
  db.prepare('DELETE FROM matches').run()
  return NextResponse.json({ ok: true })
}
