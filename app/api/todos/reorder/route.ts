import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, readJson, serverError } from '@/lib/api/http'

const MAX_IDS = 200

/**
 * POST /api/todos/reorder  { ids: [...] }
 *
 * Assigns sort_order by array index in one round trip.
 *
 * The old client issued one UPDATE per task. Moving reads and writes to the
 * server forced a choice here — N sequential fetches would have been worse than
 * what it replaced — so the batching scheduled for Release 1 landed early.
 *
 * Rows are re-read before the upsert because PostgREST upserts run through an
 * INSERT path that would reject a partial row on the NOT NULL columns.
 * Two queries total, regardless of list length.
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return badRequest('ids must be a non-empty array.')
  }
  if (ids.length > MAX_IDS) {
    return badRequest(`Cannot reorder more than ${MAX_IDS} tasks at once.`)
  }
  if (!ids.every(id => typeof id === 'string' && id.length > 0)) {
    return badRequest('ids must all be strings.')
  }
  if (new Set(ids).size !== ids.length) {
    return badRequest('ids must be unique.')
  }

  try {
    const db = createAdminClient()

    const { data: rows, error: readErr } = await db
      .from('todos').select('*').in('id', ids as string[])

    if (readErr) throw readErr
    if (!rows || rows.length !== ids.length) {
      return NextResponse.json({ error: 'One or more tasks no longer exist.' }, { status: 404 })
    }

    const order = new Map((ids as string[]).map((id, index) => [id, index]))
    const reordered = rows.map(row => ({ ...row, sort_order: order.get(row.id)! }))

    const { error: writeErr } = await db.from('todos').upsert(reordered, { onConflict: 'id' })
    if (writeErr) throw writeErr

    return NextResponse.json({ ok: true, count: reordered.length })
  } catch (err) {
    return serverError('todos.reorder', err)
  }
}
