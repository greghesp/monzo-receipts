// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/setup',
  '/auth/login',
  '/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/monzo/callback',
  '/api/auth/google/callback',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths without auth
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const sessionToken = req.cookies.get('session')?.value

  if (!sessionToken) {
    // API routes return 401; page routes redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  // Forward token as request header so server components + API routes can validate it
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-session-token', sessionToken)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
