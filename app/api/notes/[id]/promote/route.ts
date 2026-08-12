import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, readJson, serverError } from '@/lib/api/http'

/**
 * POST /api/notes/[id]/promote
 *
 * Turn a note into an item, a child of an existing item, or a dated task.
 * A multi-line note can become several at once.
 *
 * Promotion is not destruction — the note stays. Filing something wrongly has
 * to cost nothing, or the inbox stops being a place things can be dumped
 * quickly, which is the one property it must keep.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const target = body.target === 'todo' ? 'todo' : 'item'

  const titles: string[] = Array.isArray(body.titles)
    ? (body.titles as unknown[])
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map(t => t.trim())
    : []

  if (titles.length === 0) return badRequest('Nothing to promote.')
  if (titles.length > 40) return badRequest('That would create more than 40 records.')

  try {
    const db = createAdminClient()

    const { data: note } = await db.from('notes').select('id').eq('id', id).maybeSingle()
    if (!note) return NextResponse.json({ error: 'Note not found.' }, { status: 404 })

    if (target === 'todo') {
      const date = typeof body.task_date === 'string' ? body.task_date : null
      if (!isIsoDate(date)) return badRequest('task_date must be a YYYY-MM-DD date.')

      const { data, error } = await db.from('todos').insert(
        titles.map(title => ({
          title,
          task_date: date,
          // Chosen by hand, so rollover leaves it alone while it is future.
          placement: 'manual',
          origin_date: date,
        })),
      ).select()

      if (error) throw error
      return NextResponse.json({ kind: 'todo', created: data }, { status: 201 })
    }

    const planned = typeof body.planned_date === 'string' && isIsoDate(body.planned_date)
      ? body.planned_date
      : null

    const { data, error } = await db.from('items').insert(
      titles.map((title, index) => ({
        title,
        parent_id: typeof body.parent_id === 'string' ? body.parent_id : null,
        category_id: typeof body.category_id === 'string' ? body.category_id : null,
        planned_date: planned,
        sort_order: index,
      })),
    ).select()

    if (error) throw error
    return NextResponse.json({ kind: 'item', created: data }, { status: 201 })
  } catch (err) {
    return serverError('notes.promote', err)
  }
}
