import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

/** Moving a task between days is a change of task_date; the rest is derived. */
const WRITABLE = [
  'title', 'task_date', 'category',
  'start_time', 'end_time', 'is_complete', 'sort_order',
  // Choosing a day by hand is what makes placement 'manual'; without it here
  // the flag was silently dropped and rollover would walk a deliberate date.
  'placement', 'origin_date',
] as const

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

  if ('task_date' in patch && !isIsoDate(patch.task_date as string)) {
    return badRequest('task_date must be a YYYY-MM-DD date.')
  }

  // completed_at is derived here, never accepted from the client, so local
  // state and the database cannot disagree about when something was finished.
  if ('is_complete' in patch) {
    patch.completed_at = patch.is_complete ? new Date().toISOString() : null
  }

  if (Object.keys(patch).length === 0) return badRequest('No writable fields supplied.')

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('todos').update(patch).eq('id', id).select().single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    return NextResponse.json({ todo: data })
  } catch (err) {
    return serverError('todos.PATCH', err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params

  try {
    const db = createAdminClient()
    const { error } = await db.from('todos').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError('todos.DELETE', err)
  }
}
