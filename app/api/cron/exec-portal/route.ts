import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { configuredPortals, syncExecPortal } from '@/lib/sync/exec-portal'
import { today as todayIso } from '@/lib/dates'

/**
 * Hourly pull of every configured portal. Same shape as the Canvas cron: a
 * GET with the cron secret, the identical sync the manual route runs, and
 * "skipped" rather than "failed" when nothing is configured.
 *
 * One portal failing does not stop the next: each is synced on its own and
 * its error reported by name, so a dead H4HVT token cannot silently stall
 * OCCM for a week.
 */
export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const portals = configuredPortals(process.env)
  if (portals.length === 0) {
    return NextResponse.json({ skipped: 'No portal has both its feed URL and token set.' })
  }

  try {
    const db = createAdminClient()
    const now = todayIso()
    const results = []
    for (const portal of portals) {
      try {
        results.push(await syncExecPortal(db, portal, now))
      } catch (err) {
        results.push({ source: portal.source, error: err instanceof Error ? err.message : String(err) })
      }
    }
    console.log('[cron.exec-portal]', JSON.stringify(results))
    return NextResponse.json({ portals: results })
  } catch (err) {
    return serverError('cron.exec-portal.GET', err)
  }
}
