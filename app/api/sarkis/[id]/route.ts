import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

const WRITABLE = [
  'title', 'category', 'subcategory', 'priority', 'status',
  'planned_date', 'due_date', 'notes', 'sort_order', 'start_time', 'end_time',
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

  if (Object.keys(patch).length === 0) return badRequest('No writable fields supplied.')
  patch.updated_at = new Date().toISOString()

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('sarkis_tasks').update(patch).eq('id', id).select().single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    return NextResponse.json({ task: data })
  } catch (err) {
    return serverError('sarkis.PATCH', err)
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
    const { error } = await db.from('sarkis_tasks').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError('sarkis.DELETE', err)
  }
}
