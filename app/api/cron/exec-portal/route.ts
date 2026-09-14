import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { syncExecPortal } from '@/lib/sync/exec-portal'
import { today as todayIso } from '@/lib/dates'

/**
 * Nightly exec-portal pull. Same shape as app/api/cron/canvas/route.ts: a
 * GET with the cron secret, the identical sync the manual route runs, and
 * "skipped" rather than "failed" when nothing is configured.
 */
export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const feedUrl = process.env.EXEC_PORTAL_FEED_URL
  const token = process.env.EXEC_PORTAL_TOKEN
  if (!feedUrl || !token) {
    return NextResponse.json({ skipped: 'EXEC_PORTAL_FEED_URL or EXEC_PORTAL_TOKEN is not set.' })
  }

  try {
    const report = await syncExecPortal(createAdminClient(), { feedUrl, token }, todayIso())
    console.log('[cron.exec-portal]', JSON.stringify(report))
    return NextResponse.json(report)
  } catch (err) {
    return serverError('cron.exec-portal.GET', err)
  }
}
