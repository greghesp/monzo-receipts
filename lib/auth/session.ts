// lib/auth/session.ts
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { getSessionByToken, touchSession } from '@/lib/db/queries/sessions'
import type { NextResponse } from 'next/server'

const SALT_ROUNDS = 10
const COOKIE_NAME = 'session'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export interface SessionUser {
  userId: number
  username: string
}

/**
 * Validate a session token against the DB.
 * Returns the session user or null if the token is missing/invalid.
 * Also updates last_seen_at for valid sessions.
 */
export function requireSession(db: Database.Database, token: string | undefined): SessionUser | null {
  if (!token) return null
  const row = getSessionByToken(db, token)
  if (!row) return null
  touchSession(db, token)
  return { userId: row.user_id, username: row.username }
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // No maxAge / expires → session cookie that persists until logout
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/' })
}

export const SESSION_COOKIE_NAME = COOKIE_NAME
