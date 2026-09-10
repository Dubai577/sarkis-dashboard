import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildIcs, type IcsOut } from '@/lib/ics-write'
import { today as todayIso } from '@/lib/dates'

/**
 * GET /api/feed/calendar.ics?key=… — the dashboard as a calendar feed.
 *
 * Google Calendar cannot log in, so this cannot sit behind the owner session.
 * It is guarded by a single secret in the URL instead, which is the same trust
 * model Canvas uses for the feeds this app consumes: anyone holding the link
 * can read the calendar, so the link is the credential.
 *
 * Read-only by construction — there is no write path here at all.
 *
 * What it publishes is the PLAN, not the deadlines: the planned date is the
 * day the work is meant to happen, and a calendar is a statement about days.
 * Anything with no plan of its own (an exam, something newly posted) falls
 * back to its deadline, so nothing dated is ever missing.
 *
 * A note on "live": Google re-polls an external ICS on its own schedule, which
 * in practice is hours, not minutes. REFRESH-INTERVAL asks for an hour and is
 * a hint it may ignore. Anything that must be instant belongs in the app.
 */

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = process.env.FEED_TOKEN
  if (!secret) {
    return NextResponse.json({ error: 'FEED_TOKEN is not configured.' }, { status: 503 })
  }
  if (req.nextUrl.searchParams.get('key') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = todayIso()

  // A term behind and a term ahead. A calendar subscription that carries five
  // years of history is slow to sync and useless to look at.
  const from = new Date(`${now}T12:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 60)
  const until = new Date(`${now}T12:00:00Z`)
  until.setUTCDate(until.getUTCDate() + 200)

  const [items, todos] = await Promise.all([
    db.from('items')
      .select('id,title,planned_date,due_date,progress,parent_id,link')
      .is('archived_at', null),
    db.from('todos')
      .select('id,title,task_date,is_complete,source_item_id')
      .gte('task_date', from.toISOString().slice(0, 10))
      .lte('task_date', until.toISOString().slice(0, 10)),
  ])

  const rows = items.data ?? []
  const byId = new Map(rows.map(r => [r.id, r]))
  const events: IcsOut[] = []

  /**
   * A todo already represents its item on a specific day, and it is the thing
   * that can be ticked off. Publishing both would put the same assignment on
   * the calendar twice — the duplication the in-app calendar was just fixed for.
   */
  const mirrored = new Set(
    (todos.data ?? []).map(t => t.source_item_id).filter(Boolean) as string[],
  )

  for (const t of todos.data ?? []) {
    // A finished task is history; it does not belong on a forward calendar.
    if (t.is_complete) continue
    const src = t.source_item_id ? byId.get(t.source_item_id) : undefined
    const parent = src?.parent_id ? byId.get(src.parent_id) : undefined
    events.push({
      uid: `todo-${t.id}`,
      date: t.task_date,
      title: parent ? `${t.title} — ${parent.title}` : t.title,
      description: src?.due_date ? `Due ${src.due_date}` : null,
      url: src?.link ?? null,
    })
  }

  for (const i of rows) {
    if (i.progress === 'done' || mirrored.has(i.id)) continue
    const date = i.planned_date ?? i.due_date
    if (!date) continue
    const parent = i.parent_id ? byId.get(i.parent_id) : undefined
    events.push({
      uid: `item-${i.id}`,
      date,
      title: parent ? `${i.title} — ${parent.title}` : i.title,
      description: i.due_date && i.due_date !== date ? `Due ${i.due_date}` : null,
      url: i.link ?? null,
    })
  }

  const body = buildIcs(
    events.sort((a, b) => a.date.localeCompare(b.date)),
    'Merc',
  )

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
      'Content-Disposition': 'inline; filename="merc.ics"',
    },
  })
}
