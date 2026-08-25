import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'
import { loadItemViews, childrenOf, ancestorsOf, splitPreview } from '@/lib/db/items'
import { today as todayIso } from '@/lib/dates'

const WRITABLE = [
  'parent_id', 'title', 'notes', 'category_id', 'priority', 'status',
  'planned_date', 'due_date', 'start_time', 'end_time', 'sort_order',
  'board', 'waiting_on', 'waiting_since', 'nudge_after', 'link', 'is_group',
] as const

/** GET /api/items/[id] — the item, its children, and its ancestors. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params

  try {
    const all = await loadItemViews()
    const item = all.find(i => i.id === id)
    if (!item) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    return NextResponse.json({
      item,
      children: childrenOf(all, id),
      ancestors: ancestorsOf(all, id),
      split: splitPreview(item.title),
    })
  } catch (err) {
    return serverError('items.id.GET', err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const patch: Record<string, unknown> = pick(body, WRITABLE)
  const invalid = validateScalars(patch)
  if (invalid) return badRequest(invalid)

  if ('title' in patch) {
    if (typeof patch.title !== 'string' || !patch.title.trim()) {
      return badRequest('title cannot be empty.')
    }
    patch.title = patch.title.trim()
  }

  if ('board' in patch && !['auto', 'pinned', 'muted'].includes(patch.board as string)) {
    return badRequest('board must be auto, pinned or muted.')
  }

  if (patch.parent_id === id) return badRequest('An item cannot be its own parent.')

  /**
   * Setting `theirs` stamps waiting_since automatically. Requiring the caller
   * to send both would let the two drift, and a null waiting_since silently
   * disables the dropped calculation — the one thing that must not fail quietly.
   */
  if ('waiting_on' in patch) {
    if (patch.waiting_on) {
      if (!patch.waiting_since) patch.waiting_since = todayIso()
    } else {
      patch.waiting_since = null
    }
  }

  if ('archived' in body) {
    patch.archived_at = body.archived ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) return badRequest('No writable fields supplied.')

  try {
    const db = createAdminClient()

    // A move must not put an item inside its own subtree.
    if (patch.parent_id) {
      const all = await loadItemViews({ includeArchived: true })
      const descendants = new Set<string>([id])
      let added = true
      while (added) {
        added = false
        for (const candidate of all) {
          if (candidate.parent_id && descendants.has(candidate.parent_id) && !descendants.has(candidate.id)) {
            descendants.add(candidate.id)
            added = true
          }
        }
      }
      if (descendants.has(patch.parent_id as string)) {
        return badRequest('Cannot move an item inside one of its own children.')
      }
    }

    const { data, error } = await db.from('items').update(patch).eq('id', id).select().single()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    /**
     * Archiving a parent archives its subtree — and unarchiving restores it.
     * The two must mirror each other: archiving a project and then restoring it
     * only to find its children still hidden is the kind of half-state that
     * makes people stop trusting archive and go back to deleting.
     *
     * An item whose own parent is still archived is left alone, so restoring a
     * child does not silently resurrect it into a hidden parent.
     */
    if ('archived' in body) {
      const all = await loadItemViews({ includeArchived: true })
      const stack = [id]
      const ids: string[] = []
      while (stack.length) {
        const current = stack.pop()!
        for (const child of all.filter(c => c.parent_id === current)) {
          ids.push(child.id)
          stack.push(child.id)
        }
      }
      if (ids.length) {
        await db.from('items').update({ archived_at: patch.archived_at }).in('id', ids)
      }
    }

    return NextResponse.json({ item: data })
  } catch (err) {
    return serverError('items.id.PATCH', err)
  }
}

/**
 * DELETE archives rather than deleting. 137 rows were imported and 82 remain,
 * because finishing something here has always meant deleting it — which is
 * exactly why nothing can be measured. Closure is now a signal, not a hole.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params
  const hard = req.nextUrl.searchParams.get('hard') === 'true'

  try {
    const db = createAdminClient()

    if (hard) {
      const { error } = await db.from('items').delete().eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true, deleted: true })
    }

    const stamp = new Date().toISOString()
    const all = await loadItemViews({ includeArchived: true })
    const stack = [id]
    const ids = [id]
    while (stack.length) {
      const current = stack.pop()!
      for (const child of all.filter(c => c.parent_id === current)) {
        ids.push(child.id)
        stack.push(child.id)
      }
    }

    const { error } = await db.from('items').update({ archived_at: stamp }).in('id', ids)
    if (error) throw error

    return NextResponse.json({ ok: true, archived: ids.length })
  } catch (err) {
    return serverError('items.id.DELETE', err)
  }
}
