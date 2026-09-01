import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'
import { insertItems, loadItemViews, boardItems, areaItems, childrenOf } from '@/lib/db/items'

const WRITABLE = [
  'parent_id', 'title', 'notes', 'category_id', 'priority', 'status',
  'planned_date', 'due_date', 'start_time', 'end_time', 'sort_order',
  'board', 'waiting_on', 'waiting_since', 'nudge_after', 'link', 'is_group', 'progress',
] as const

/**
 * GET /api/items
 *   ?view=board       roots for the projects board, plus the muted areas
 *   ?parent=<id>      direct children of one item
 *   ?archived=only    archived items — the restore list
 *   ?archived=include open and archived together
 *   (default)         every open item
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const view = req.nextUrl.searchParams.get('view')
  const parent = req.nextUrl.searchParams.get('parent')
  const archived = req.nextUrl.searchParams.get('archived')

  try {
    const all = await loadItemViews({ includeArchived: archived === 'only' || archived === 'include' })

    if (archived === 'only') {
      return NextResponse.json({
        items: all
          .filter(i => i.archived_at)
          .sort((a, b) => (b.archived_at ?? '').localeCompare(a.archived_at ?? '')),
      })
    }

    if (view === 'board') {
      return NextResponse.json({
        projects: boardItems(all).sort((a, b) => b.heat - a.heat || a.title.localeCompare(b.title)),
        areas: areaItems(all).sort((a, b) => (a.category?.sort_order ?? 99) - (b.category?.sort_order ?? 99)),
      })
    }

    if (parent) {
      return NextResponse.json({ items: childrenOf(all, parent) })
    }

    return NextResponse.json({ items: all })
  } catch (err) {
    return serverError('items.GET', err)
  }
}

/** POST /api/items — create. Only `title` is required; nothing else is asked for. */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const insert = pick(body, WRITABLE)
  const invalid = validateScalars(insert)
  if (invalid) return badRequest(invalid)

  if (typeof insert.title !== 'string' || !insert.title.trim()) {
    return badRequest('title is required.')
  }
  insert.title = insert.title.trim()

  if (insert.board && !['auto', 'pinned', 'muted'].includes(insert.board as string)) {
    return badRequest('board must be auto, pinned or muted.')
  }

  try {
    const db = createAdminClient()

    // Land new children at the end of their parent rather than the top.
    if (insert.parent_id && insert.sort_order === undefined) {
      const { count } = await db
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', insert.parent_id)
      insert.sort_order = count ?? 0
    }

    const [item] = (await insertItems(db, [insert])) ?? []

    return NextResponse.json({ item }, { status: 201 })
  } catch (err) {
    return serverError('items.POST', err)
  }
}
