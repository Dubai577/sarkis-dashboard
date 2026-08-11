import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session'
import { PORTAL_DISABLED, PORTAL_DISABLED_MESSAGE } from '@/lib/portal/status'

/**
 * Next 16 renamed `middleware` to `proxy`. Same behaviour, new file convention.
 *
 * This is an optimistic gate only: it reads the signed cookie and never touches
 * the database, because it runs on every route including prefetches. The real
 * authorization lives in lib/auth/guard.ts, called by each server action and
 * route handler.
 *
 * The matcher deliberately covers everything except static assets, and the
 * public list below is explicit. Narrowing the matcher instead would silently
 * drop coverage for Server Functions, which Next routes as POSTs to the page
 * they are invoked from.
 */

/** Reachable without an owner session. Matched as a path prefix. */
const PUBLIC_PREFIXES = [
  '/login',              // the login screen itself
  '/api/login',          // and the endpoint behind it
  '/portal',             // contributor portal — PIN-gated separately
  '/api/portal',         // portal endpoints — cookie + ownership checked per route
  '/api/send-morning',   // cron — CRON_SECRET
  '/api/send-weekly',    // cron — CRON_SECRET
  '/api/cron',           // cron — CRON_SECRET
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  /**
   * Portal paused until the Release 5 rebuild. Gating sign-in alone would not
   * be enough, because an existing session cookie bypasses it — so everything
   * under /portal and /api/portal is refused. The /portal landing page stays
   * up to explain the outage.
   *
   * This also stops the portal's Server Functions, which POST to
   * /portal/project/[id] and would otherwise bypass every check here.
   */
  if (PORTAL_DISABLED) {
    if (pathname.startsWith('/api/portal')) {
      return NextResponse.json({ error: PORTAL_DISABLED_MESSAGE }, { status: 503 })
    }
    if (pathname.startsWith('/portal/')) {
      return NextResponse.redirect(new URL('/portal', request.url))
    }
  }

  if (isPublic(pathname)) return NextResponse.next()

  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  if (authed) return NextResponse.next()

  // API routes get a status code, not a redirect to an HTML page.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const login = new URL('/login', request.url)
  if (pathname !== '/') login.searchParams.set('next', pathname + request.nextUrl.search)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml|webmanifest)$).*)'],
}
