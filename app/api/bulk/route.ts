import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, readJson, serverError } from '@/lib/api/http'
import { today as todayIso } from '@/lib/dates'
import { parseText, type TextNode } from '@/lib/textformat'

const MAX_LINES = 200

/**
 * POST /api/bulk — paste a list, get items.
 *
 * The bottleneck on getting current data in is the creation form, not typing:
 * 5 projects exist in the app against 15+ in real life. So this takes a block
 * of text and commits every line in one round trip, with the parent, category
 * and dates chosen once for the whole batch rather than per row.
 *
 * It reads the same format the exporter writes — see lib/textformat.ts — so a
 * category file that came out of the app can be edited by hand and pasted back
 * in without translation. Indentation nests; annotations after a pipe carry
 * category, dates, person, priority, status and archived state.
 *
 * Names that do not match an existing category or person are reported in the
 * response rather than silently dropped, so a typo in a hand-edited file is
 * visible instead of quietly losing a link.
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

    // The exporter writes this format and this parser reads it, so a file that
    // came out of the app can be hand-edited and pasted straight back in.
    const roots = parseText(text)
    if (roots.length === 0) return badRequest('Nothing to add.')

    // Names resolve to ids once, so a whole paste costs two lookups.
    const [{ data: cats }, { data: persons }] = await Promise.all([
      db.from('categories').select('id,name'),
      db.from('people').select('id,name'),
    ])
    const catByName = new Map((cats ?? []).map(c => [c.name.trim().toLowerCase(), c.id]))
    const personByName = new Map((persons ?? []).map(p => [p.name.trim().toLowerCase(), p.id]))

    const unknownCategories = new Set<string>()
    const unknownPeople = new Set<string>()

    const rowFor = (node: TextNode, parent: string | null, order: number) => {
      const category = node.category
        ? catByName.get(node.category.trim().toLowerCase())
        : undefined
      if (node.category && !category) unknownCategories.add(node.category)

      const person = node.waiting_on
        ? personByName.get(node.waiting_on.trim().toLowerCase())
        : undefined
      if (node.waiting_on && !person) unknownPeople.add(node.waiting_on)

      return {
        parent_id: parent,
        title: node.title,
        notes: node.notes ?? null,
        category_id: category ?? categoryId,
        planned_date: node.planned_date ?? plannedDate,
        due_date: node.due_date ?? null,
        priority: node.priority ?? null,
        status: node.status ?? null,
        board: node.board ?? 'auto',
        nudge_after: node.nudge_after ?? 7,
        waiting_on: person ?? waitingOn,
        waiting_since: (person ?? waitingOn) ? todayIso() : null,
        archived_at: node.archived ? new Date().toISOString() : null,
        sort_order: order,
      }
    }

    // One level at a time: a child needs its parent's id, which exists only
    // after that row is written.
    let created = 0
    const writeLevel = async (nodes: TextNode[], parent: string | null): Promise<void> => {
      if (nodes.length === 0) return
      const { data, error } = await db
        .from('items')
        .insert(nodes.map((n, i) => rowFor(n, parent, i)))
        .select('id')
      if (error) throw error
      created += data?.length ?? 0

      // Anyone this item is waiting on is also linked, so a person page shows it.
      const links = (data ?? []).flatMap((row, i) => {
        const person = rowFor(nodes[i], parent, i).waiting_on
        return person ? [{ item_id: row.id, person_id: person, relation: 'waiting_on' }] : []
      })
      if (links.length) {
        await db.from('item_people').upsert(links, { onConflict: 'item_id,person_id,relation' })
      }

      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].children.length) await writeLevel(nodes[i].children, data![i].id)
      }
    }

    await writeLevel(roots, parentId)

    return NextResponse.json(
      {
        created,
        roots: roots.length,
        // Named but unmatched values are reported rather than silently dropped,
        // so a typo in a hand-edited file is visible instead of losing a link.
        unknownCategories: [...unknownCategories],
        unknownPeople: [...unknownPeople],
      },
      { status: 201 },
    )
  } catch (err) {
    return serverError('bulk.POST', err)
  }
}
