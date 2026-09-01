import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { parseIcs, upcoming, type IcsEvent } from '@/lib/ics'
import { today as todayIso } from '@/lib/dates'

/**
 * POST /api/canvas/sync — pull Canvas coursework into the tree.
 *
 * Assignments become ordinary items under VT, one sub-project per class, with
 * the assignment's deadline as a **due date**. Never a planned date: Canvas
 * knows when a thing is due, and has no idea when you intend to sit down and
 * do it. Those are different facts and conflating them would overwrite the
 * only half you actually decide.
 *
 * Ownership is split, and the split is what makes re-syncing safe:
 *
 *   Canvas owns   title, due_date, which class it belongs to
 *   you own       planned_date, priority, notes, archived_at
 *
 * so a second run moves a deadline that moved, and leaves everything you
 * decided about it alone. Rows are matched on the feed's own UID, so nothing
 * is ever created twice.
 *
 * Set CANVAS_ICS_URL to one feed URL, or several separated by commas — one
 * Canvas calendar does not necessarily cover every class.
 */

/** "MSE 2034" matches the existing "MSE 2034 - Elem of Mat Eng". */
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase()
}

export async function POST(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const configured = (process.env.CANVAS_ICS_URL ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean)

  if (configured.length === 0) {
    return NextResponse.json({ error: 'CANVAS_ICS_URL is not set.' }, { status: 400 })
  }

  try {
    const db = createAdminClient()
    const now = todayIso()

    // ── read every feed ──
    const events: IcsEvent[] = []
    const feedErrors: string[] = []
    for (const url of configured) {
      const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'text/calendar' } })
      if (!res.ok) {
        // Never leak the URL: it is a bearer credential.
        feedErrors.push(`A feed returned ${res.status}.`)
        continue
      }
      events.push(...parseIcs(await res.text()))
    }

    // A term's worth. Older work is history; a year out is noise.
    const window = upcoming(events, now, 120)

    const { data: allItems, error: readErr } = await db
      .from('items')
      .select('id,title,parent_id,external_uid,due_date,archived_at')
    if (readErr) throw readErr
    const items = allItems ?? []

    // ── the VT root, and a sub-project per class ──
    const vt = items.find(i => !i.parent_id && normalise(i.title) === 'VT' && !i.archived_at)
    if (!vt) {
      return NextResponse.json(
        { error: 'No live top-level project called "VT" to sync into.' },
        { status: 409 },
      )
    }

    const classes = new Map<string, string>()   // course code -> item id
    const createdClasses: string[] = []

    for (const code of [...new Set(window.map(e => e.course).filter(Boolean) as string[])]) {
      const existing = items.find(
        i => i.parent_id === vt.id && !i.archived_at && normalise(i.title).startsWith(normalise(code)),
      )
      if (existing) {
        classes.set(code, existing.id)
        continue
      }
      const { data, error } = await db
        .from('items')
        .insert({ title: code, parent_id: vt.id, is_group: true })
        .select('id')
        .single()
      if (error) throw error
      classes.set(code, data.id)
      createdClasses.push(code)
    }

    // ── upsert the assignments ──
    const byUid = new Map(items.filter(i => i.external_uid).map(i => [i.external_uid!, i]))
    let created = 0
    let updated = 0
    let unchanged = 0
    let skippedArchived = 0

    for (const event of window) {
      const parentId = event.course ? classes.get(event.course) ?? vt.id : vt.id
      const existing = byUid.get(event.uid)

      if (!existing) {
        const { error } = await db.from('items').insert({
          title: event.title,
          parent_id: parentId,
          due_date: event.date,
          external_uid: event.uid,
          external_source: 'canvas',
          external_synced_at: new Date().toISOString(),
          link: event.url,
        })
        if (error) throw error
        created++
        continue
      }

      /**
       * Something you archived stays archived. Canvas will keep listing a
       * finished assignment all term, and resurrecting it every sync is how a
       * synced list becomes one nobody trusts.
       */
      if (existing.archived_at) {
        skippedArchived++
        continue
      }

      const changed =
        existing.title !== event.title ||
        existing.due_date !== event.date ||
        existing.parent_id !== parentId

      if (!changed) {
        unchanged++
        continue
      }

      const { error } = await db
        .from('items')
        .update({
          title: event.title,
          due_date: event.date,
          parent_id: parentId,
          external_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
      updated++
    }

    return NextResponse.json({
      feeds: configured.length,
      events: window.length,
      created,
      updated,
      unchanged,
      skippedArchived,
      classes: [...classes.keys()].sort(),
      createdClasses,
      errors: feedErrors,
    })
  } catch (err) {
    return serverError('canvas.sync.POST', err)
  }
}
