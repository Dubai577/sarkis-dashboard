import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { configuredPortals, syncExecPortal } from '@/lib/sync/exec-portal'
import { today as todayIso } from '@/lib/dates'

/**
 * POST /api/exec-portal/sync — the manual trigger, owner session required.
 * Syncs every configured portal; the dashboard calls this on open when the
 * last pull is stale.
 */
export async function POST(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const portals = configuredPortals(process.env)
  if (portals.length === 0) {
    return NextResponse.json({ error: 'No portal has both its feed URL and token set.' }, { status: 400 })
  }

  try {
    const db = createAdminClient()
    const now = todayIso()
    const results = []
    let created = 0, updated = 0, archived = 0, updatesStored = 0
    for (const portal of portals) {
      try {
        const r = await syncExecPortal(db, portal, now)
        results.push(r)
        created += r.created; updated += r.updated; archived += r.archived; updatesStored += r.updatesStored
      } catch (err) {
        results.push({ source: portal.source, error: err instanceof Error ? err.message : String(err) })
      }
    }
    // Totals up front so the dashboard's "did anything change" check stays one line.
    return NextResponse.json({ created, updated, archived, updatesStored, portals: results })
  } catch (err) {
    return serverError('exec-portal.sync.POST', err)
  }
}
