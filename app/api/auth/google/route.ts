import { NextResponse } from 'next/server'
import { buildGoogleAuthUrl } from '@/lib/auth/google'

export async function GET() {
  return NextResponse.redirect(buildGoogleAuthUrl(process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!))
}
