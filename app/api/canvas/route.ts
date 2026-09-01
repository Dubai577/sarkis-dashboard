import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { parseIcs, upcoming } from '@/lib/ics'
import { today as todayIso } from '@/lib/dates'

/**
 * GET /api/canvas — the Canvas coursework feed, live.
 *
 * Read-through, never stored. Copying assignments into `items` would mean
 * reconciling two sources forever: a due date moves in Canvas and the local
 * copy is silently wrong, a row is deleted there and an orphan survives here.
 * Canvas owns coursework; this mirrors it.
 *
 * The feed URL is a bearer credential in disguise — anyone holding it can read
 * the whole calendar — so it lives in an env var, never in the repo and never
 * in a response. If it is unset the route says so plainly rather than 500ing,
 * because "not configured" and "broken" need different fixes.
 */

export const revalidate = 900

export async function GET(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const url = process.env.CANVAS_ICS_URL
  if (!url) {
    return NextResponse.json(
      { configured: false, events: [], courses: [], error: 'CANVAS_ICS_URL is not set.' },
      { status: 200 },
    )
  }

  try {
    const res = await fetch(url, {
      // Canvas regenerates the feed on a schedule; a quarter hour is well
      // inside how fast a due date ever moves, and keeps the dashboard from
      // hammering an external host on every page view.
      next: { revalidate: 900 },
      headers: { Accept: 'text/calendar' },
    })

    if (!res.ok) {
      return NextResponse.json(
        { configured: true, events: [], courses: [], error: `Canvas returned ${res.status}.` },
        { status: 200 },
      )
    }

    const events = upcoming(parseIcs(await res.text()), todayIso(), 45)
    const courses = [...new Set(events.map(e => e.course).filter(Boolean))]

    return NextResponse.json({ configured: true, events, courses, error: null })
  } catch (err) {
    // A dashboard must render when a third party is down: report the failure
    // in the payload rather than taking the whole page with it.
    return serverError('canvas.GET', err)
  }
}
