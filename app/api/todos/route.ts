import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

const WRITABLE = [
  'title', 'day_of_week', 'week_start', 'category',
  'start_time', 'end_time', 'is_complete', 'sort_order',
] as const

/** GET /api/todos?week=YYYY-MM-DD → { todos, overdue } */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const week = req.nextUrl.searchParams.get('week')
  if (!isIsoDate(week)) return badRequest('week must be a YYYY-MM-DD date.')

  try {
    const db = createAdminClient()

    const [{ data: todos, error: todosErr }, { data: overdue, error: overdueErr }] =
      await Promise.all([
        db.from('todos').select('*').eq('week_start', week).order('sort_order'),
        db.from('todos').select('*').lt('week_start', week).eq('is_complete', false),
      ])

    if (todosErr || overdueErr) throw todosErr ?? overdueErr

    return NextResponse.json({ todos: todos ?? [], overdue: overdue ?? [] })
  } catch (err) {
    return serverError('todos.GET', err)
  }
}

/** POST /api/todos */
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
  if (!isIsoDate(typeof insert.week_start === 'string' ? insert.week_start : null)) {
    return badRequest('week_start must be a YYYY-MM-DD date.')
  }
  insert.title = insert.title.trim()

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('todos').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json({ todo: data }, { status: 201 })
  } catch (err) {
    return serverError('todos.POST', err)
  }
}
