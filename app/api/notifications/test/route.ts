import { NextResponse } from 'next/server'
import { testNotify } from '@/lib/notifications'

export async function POST() {
  const result = await testNotify()
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
