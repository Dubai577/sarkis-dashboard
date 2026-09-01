import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { syncCanvas } from '@/lib/sync/canvas'
import { today as todayIso } from '@/lib/dates'

/**
 * Nightly Canvas pull.
 *
 * Separate from POST /api/canvas/sync because the two callers cannot
 * authenticate the same way: a person has an admin session, a Vercel cron has
 * a shared secret and can only send GET. Both run the identical sync in
 * lib/sync/canvas.ts, so a scheduled run can never behave differently from one
 * you trigger by hand.
 *
 * Scheduled ahead of the 11:00 UTC morning digest so the day's email reflects
 * deadlines as they stand this morning, not as they stood yesterday.
 *
 * A missing CANVAS_ICS_URL is reported as skipped rather than as a failure:
 * an unconfigured feed is not a broken one, and a cron that alarms about
 * something nobody asked for gets ignored.
 */
export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const feeds = (process.env.CANVAS_ICS_URL ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)

  if (feeds.length === 0) {
    return NextResponse.json({ skipped: 'CANVAS_ICS_URL is not set.' })
  }

  try {
    const report = await syncCanvas(createAdminClient(), feeds, todayIso())
    // Surfaced in the Vercel log, which is the only place anyone reads a cron.
    console.log('[cron.canvas]', JSON.stringify(report))
    return NextResponse.json(report)
  } catch (err) {
    return serverError('cron.canvas.GET', err)
  }
}
