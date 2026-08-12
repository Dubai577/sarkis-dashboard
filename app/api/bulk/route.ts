import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, readJson, serverError } from '@/lib/api/http'
import { today as todayIso } from '@/lib/dates'

const MAX_LINES = 200

/**
 * POST /api/bulk — paste a list, get items.
 *
 * The bottleneck on getting current data in is the creation form, not typing:
 * 5 projects exist in the app against 15+ in real life. So this takes a block
 * of text and commits every line in one round trip, with the parent, category
 * and dates chosen once for the whole batch rather than per row.
 *
 * Indentation makes a line a child of the line above it, so a project and its
 * tasks can be pasted together:
 *
 *     convent service trip
 *       book the van
 *       confirm numbers with omena
 *
 * Everything is inserted in one statement. A batch either lands whole or not at
 * all, which matters when you are pasting thirty lines from a WhatsApp thread
 * and cannot tell which ones made it.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const text = typeof body.text === 'string' ? body.text : ''
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)

  if (lines.length === 0) return badRequest('Nothing to add.')
  if (lines.length > MAX_LINES) {
    return badRequest(`That is ${lines.length} lines; ${MAX_LINES} is the limit for one paste.`)
  }

  const parentId = typeof body.parent_id === 'string' && body.parent_id ? body.parent_id : null
  const categoryId = typeof body.category_id === 'string' && body.category_id ? body.category_id : null
  const waitingOn = typeof body.waiting_on === 'string' && body.waiting_on ? body.waiting_on : null
  const plannedDate = isIsoDate(typeof body.planned_date === 'string' ? body.planned_date : null)
    ? (body.planned_date as string)
    : null

  try {
    const db = createAdminClient()

    // Parents first: an indented line needs its parent's id, which only exists
    // after that row is written.
    const roots: { title: string; children: string[] }[] = []
    for (const raw of lines) {
      const indented = /^[\s>\-*•]+\S/.test(raw) && /^(\s{2,}|\t|[-*•>]\s)/.test(raw)
      const title = raw.replace(/^[\s>\-*•]+/, '').trim()
      if (!title) continue
      if (indented && roots.length > 0) roots[roots.length - 1].children.push(title)
      else roots.push({ title, children: [] })
    }

    if (roots.length === 0) return badRequest('Nothing to add.')

    const base = {
      category_id: categoryId,
      waiting_on: waitingOn,
      waiting_since: waitingOn ? todayIso() : null,
      planned_date: plannedDate,
    }

    const { data: created, error } = await db
      .from('items')
      .insert(roots.map((r, index) => ({ ...base, parent_id: parentId, title: r.title, sort_order: index })))
      .select('id,title')

    if (error) throw error

    let childCount = 0
    const childRows = roots.flatMap((r, index) =>
      r.children.map((title, childIndex) => ({
        ...base,
        parent_id: created?.[index]?.id,
        title,
        sort_order: childIndex,
      })),
    ).filter(r => r.parent_id)

    if (childRows.length > 0) {
      const { data: kids, error: childErr } = await db.from('items').insert(childRows).select('id')
      if (childErr) throw childErr
      childCount = kids?.length ?? 0
    }

    if (waitingOn) {
      const ids = (created ?? []).map(c => c.id)
      if (ids.length) {
        await db.from('item_people').upsert(
          ids.map(id => ({ item_id: id, person_id: waitingOn, relation: 'waiting_on' })),
          { onConflict: 'item_id,person_id,relation' },
        )
      }
    }

    return NextResponse.json(
      { created: created?.length ?? 0, children: childCount, items: created ?? [] },
      { status: 201 },
    )
  } catch (err) {
    return serverError('bulk.POST', err)
  }
}
