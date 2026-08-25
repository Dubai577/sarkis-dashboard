import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, readJson, serverError } from '@/lib/api/http'
import { loadItemViews } from '@/lib/db/items'

const MAX = 300

/**
 * POST /api/items/move  { ids: [...], parent_id: string | null }
 *
 * Re-parents many items in one call. Organising 55 inbox rows into departments
 * one PATCH at a time would be 55 round trips and 55 chances to half-finish;
 * this is one write, so a move either lands whole or not at all.
 *
 * parent_id null moves the items to the top level.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const { ids, parent_id: parentId } = body

  if (!Array.isArray(ids) || ids.length === 0) return badRequest('Nothing selected.')
  if (ids.length > MAX) return badRequest(`Cannot move more than ${MAX} at once.`)
  if (!ids.every(id => typeof id === 'string' && id)) return badRequest('ids must be strings.')
  if (parentId !== null && typeof parentId !== 'string') {
    return badRequest('parent_id must be an id or null.')
  }
  if (parentId && ids.includes(parentId)) {
    return badRequest('An item cannot be moved into itself.')
  }

  try {
    const db = createAdminClient()

    // A move must never put an item inside its own subtree, or the tree stops
    // being a tree and every reader loops forever.
    if (parentId) {
      const all = await loadItemViews({ includeArchived: true })
      const moving = new Set<string>(ids as string[])
      let grew = true
      while (grew) {
        grew = false
        for (const n of all) {
          if (n.parent_id && moving.has(n.parent_id) && !moving.has(n.id)) {
            moving.add(n.id)
            grew = true
          }
        }
      }
      if (moving.has(parentId)) {
        return badRequest('That would move an item inside one of its own children.')
      }
    }

    const { data, error } = await db
      .from('items')
      .update({ parent_id: parentId, updated_at: new Date().toISOString() })
      .in('id', ids as string[])
      .select('id')

    if (error) throw error
    return NextResponse.json({ moved: data?.length ?? 0 })
  } catch (err) {
    return serverError('items.move', err)
  }
}
