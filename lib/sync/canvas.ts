// Relative, not the '@/' alias: this module is run directly by
// scripts/canvas-sync.mjs as well as by the route, and plain Node does not
// know the alias. One import style that works in both beats two code paths.
import { parseIcs, upcoming, type IcsEvent } from '../ics.ts'
import { planFor } from './planning.ts'

/**
 * The Canvas sync itself, separate from the route that triggers it.
 *
 * The route needs an authenticated request and a configured environment; a
 * one-off run from a terminal needs neither. Putting the logic here means the
 * first run and every later scheduled run are the same code, rather than a
 * script that approximates the endpoint and drifts from it.
 *
 * Ownership is split, and that split is the whole design:
 *
 *   Canvas owns   title, due_date, which class it sits under
 *   you own       planned_date, priority, notes, archived_at
 *
 * A deadline that moves in Canvas moves here. A plan you made survives. Rows
 * match on the feed's own UID, so a second run updates instead of duplicating.
 */

export interface SyncReport {
  feeds: number
  events: number
  created: number
  updated: number
  unchanged: number
  skippedArchived: number
  planned: number
  classes: string[]
  createdClasses: string[]
  errors: string[]
}

/** "MSE 2034" matches the existing "MSE 2034 - Elem of Mat Eng". */
const normalise = (text: string) => text.replace(/\s+/g, ' ').trim().toUpperCase()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function syncCanvas(db: Db, feedUrls: string[], today: string): Promise<SyncReport> {
  const events: IcsEvent[] = []
  const errors: string[] = []

  for (const url of feedUrls) {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'text/calendar' } })
    if (!res.ok) {
      // Never echo the URL: it is a bearer credential for the whole calendar.
      errors.push(`A feed returned ${res.status}.`)
      continue
    }
    events.push(...parseIcs(await res.text()))
  }

  // A term's worth. Older work is history; a year out is noise.
  const window = upcoming(events, today, 120)

  const { data: allItems, error: readErr } = await db
    .from('items')
    .select('id,title,parent_id,external_uid,due_date,archived_at,planned_date,planned_auto')
  if (readErr) throw readErr
  const items = (allItems ?? []) as {
    id: string; title: string; parent_id: string | null
    external_uid: string | null; due_date: string | null; archived_at: string | null
    planned_date: string | null; planned_auto: boolean | null
  }[]

  const vt = items.find(i => !i.parent_id && normalise(i.title) === 'VT' && !i.archived_at)
  if (!vt) throw new Error('No live top-level project called "VT" to sync into.')

  // ── a sub-project per class ──
  const classes = new Map<string, string>()
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

  // ── the assignments ──
  const byUid = new Map(items.filter(i => i.external_uid).map(i => [i.external_uid!, i]))
  let created = 0
  let updated = 0
  let unchanged = 0
  let skippedArchived = 0
  let planned = 0

  for (const event of window) {
    const parentId = event.course ? classes.get(event.course) ?? vt.id : vt.id
    const existing = byUid.get(event.uid)

    if (!existing) {
      const plan = planFor(event.course, event.date, event.title)
      if (plan) planned++
      const { error } = await db.from('items').insert({
        title: event.title,
        parent_id: parentId,
        due_date: event.date,
        planned_date: plan,
        planned_auto: plan !== null,
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
     * Something you archived stays archived. Canvas keeps listing a finished
     * assignment all term, and resurrecting it on every sync is how a synced
     * list becomes one nobody trusts.
     */
    if (existing.archived_at) {
      skippedArchived++
      continue
    }

    /**
     * Re-derive the plan only where the app owns it. A planned date you set by
     * hand carries planned_auto false and is never touched, which is the whole
     * reason that column exists.
     */
    const ownsPlan = existing.planned_auto === true || existing.planned_date === null
    const plan = ownsPlan ? planFor(event.course, event.date, event.title) : existing.planned_date

    const changed =
      existing.title !== event.title ||
      existing.due_date !== event.date ||
      existing.parent_id !== parentId ||
      (ownsPlan && plan !== existing.planned_date)

    if (!changed) {
      unchanged++
      continue
    }

    const patch: Record<string, unknown> = {
      title: event.title,
      due_date: event.date,
      parent_id: parentId,
      external_synced_at: new Date().toISOString(),
    }
    if (ownsPlan && plan !== existing.planned_date) {
      patch.planned_date = plan
      patch.planned_auto = plan !== null
      planned++
    }

    const { error } = await db.from('items').update(patch).eq('id', existing.id)
    if (error) throw error
    updated++
  }

  return {
    feeds: feedUrls.length,
    events: window.length,
    created,
    updated,
    unchanged,
    skippedArchived,
    planned,
    classes: [...classes.keys()].sort(),
    createdClasses,
    errors,
  }
}
