import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

const WRITABLE = [
  'title', 'category', 'subcategory', 'priority', 'status',
  'planned_date', 'due_date', 'notes', 'sort_order', 'start_time', 'end_time',
] as const

/**
 * GET /api/sarkis
 *
 * Release 0 keeps the existing "fetch everything, filter in the browser"
 * behaviour so the migration stays behaviour-preserving; Release 1 moves the
 * status filter and sort into the query. Ordering is applied here so the list
 * arrives stable instead of in whatever order Postgres returns.
 */
export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('sarkis_tasks').select('*').order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ tasks: data ?? [] })
  } catch (err) {
    return serverError('sarkis.GET', err)
  }
}

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

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('sarkis_tasks').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json({ task: data }, { status: 201 })
  } catch (err) {
    return serverError('sarkis.POST', err)
  }
}
