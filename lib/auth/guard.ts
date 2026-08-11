/**
 * Authorization guards. Call these as close to the data as possible.
 *
 * Proxy is an optimistic pre-filter only. Next 16 routes Server Functions as
 * POSTs to the page they are used on, so a matcher that excludes a path also
 * skips Proxy for any Server Function invoked from that path. Every server
 * action and route handler therefore carries its own guard.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, verifySessionToken } from './session'
import { createAdminClient } from '@/lib/supabase/admin'

export class AuthError extends Error {
  status: number
  constructor(message: string, status = 401) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

/** True when the request carries a valid owner session. Never throws. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

/** For server actions. Throws — the action must not continue. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    throw new AuthError('Unauthorized: admin session required.')
  }
}

/**
 * For route handlers. Returns a 401 Response to return early, or null to proceed.
 *
 *   const denied = await denyUnlessAdmin()
 *   if (denied) return denied
 */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/**
 * Guard for the five actions in app/actions/tasks.ts that are shared between
 * the owner's admin pages and the contributor portal's project-admin screen.
 *
 * Passes for the site owner, or for a contributor who is an admin of THIS
 * project. Applying requireAdmin() to these would have broken portal admins,
 * who are contributors and hold no owner session.
 */
export async function requireOwnerOrProjectAdmin(projectId: string): Promise<void> {
  if (await isAdmin()) return

  if (!projectId || typeof projectId !== 'string') {
    throw new AuthError('Unauthorized: project scope required.')
  }

  const store = await cookies()
  const token = store.get('contributor_token')?.value
  if (!token) throw new AuthError('Unauthorized: sign in to continue.')

  const db = createAdminClient()

  const { data: contributor } = await db
    .from('contributors')
    .select('id')
    .eq('access_token', token)
    .maybeSingle()

  if (!contributor) throw new AuthError('Unauthorized: sign in to continue.')

  const { data: membership } = await db
    .from('project_members')
    .select('role')
    .eq('contributor_id', contributor.id)
    .eq('project_id', projectId)
    .maybeSingle()

  if (membership?.role !== 'admin') {
    throw new AuthError('Forbidden: you are not an admin of this project.', 403)
  }
}

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations.
 * Enforced in every environment — there is no development escape hatch,
 * because these endpoints spend real email quota.
 */
export function denyUnlessCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
