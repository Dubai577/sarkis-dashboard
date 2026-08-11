import { NextRequest, NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkAdminPassword,
  createSessionToken,
} from '@/lib/auth/session'

/**
 * Rate limit, in memory. A serverless instance holds its own counter, so this
 * slows a single attacker rather than stopping a distributed one — enough for a
 * single-user admin surface, and it costs nothing. Move it to the database if
 * this ever needs to be authoritative.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

function clearLimit(key: string) {
  attempts.delete(key)
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait 15 minutes and try again.' },
      { status: 429 },
    )
  }

  let password: unknown
  try {
    ({ password } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 })
  }

  let ok = false
  try {
    ok = await checkAdminPassword(password)
  } catch (err) {
    console.error('[login] configuration error:', err)
    return NextResponse.json(
      { error: 'Login is not configured on the server.' },
      { status: 500 },
    )
  }

  if (!ok) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
  }

  clearLimit(ip)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_MAX_AGE,
  })
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   0,
  })
  return response
}
