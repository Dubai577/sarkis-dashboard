import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { syncCanvas } from '@/lib/sync/canvas'
import { today as todayIso } from '@/lib/dates'

/**
 * POST /api/canvas/sync — pull Canvas coursework into the tree.
 *
 * The work is in lib/sync/canvas.ts so a scheduled run and a one-off run from
 * a terminal are the same code. This is only the trigger: auth, configuration,
 * and turning a thrown error into a response.
 *
 * CANVAS_ICS_URL takes one feed URL or several separated by commas — one
 * Canvas calendar does not necessarily cover every class.
 */
export async function POST(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const feeds = (process.env.CANVAS_ICS_URL ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)

  if (feeds.length === 0) {
    return NextResponse.json({ error: 'CANVAS_ICS_URL is not set.' }, { status: 400 })
  }

  try {
    return NextResponse.json(await syncCanvas(createAdminClient(), feeds, todayIso()))
  } catch (err) {
    if (err instanceof Error && err.message.includes('VT')) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return serverError('canvas.sync.POST', err)
  }
}
