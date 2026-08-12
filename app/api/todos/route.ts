import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, pick, readJson, serverError, validateScalars } from '@/lib/api/http'
import { isMonday } from '@/lib/dates'

/**
 * week_start and day_of_week are derived from task_date by the database and are
 * deliberately absent here — after migration 006 they cannot be written at all.
 */
const WRITABLE = [
  'title', 'task_date', 'category',
  'start_time', 'end_time', 'is_complete', 'sort_order',
  // Choosing a day by hand is what makes placement 'manual'; without it here
  // the flag was silently dropped and rollover would walk a deliberate date.
  'placement', 'origin_date',
] as const

/** GET /api/todos?week=YYYY-MM-DD → { todos, overdue } */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const week = req.nextUrl.searchParams.get('week')
  if (!isIsoDate(week)) return badRequest('week must be a YYYY-MM-DD date.')
  if (!isMonday(week)) return badRequest('week must be a Monday.')

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
  if (!isIsoDate(typeof insert.task_date === 'string' ? insert.task_date : null)) {
    return badRequest('task_date must be a YYYY-MM-DD date.')
  }
  insert.title = insert.title.trim()

  if (insert.placement && !['auto','manual'].includes(insert.placement as string)) {
    return badRequest('placement must be auto or manual.')
  }
  // A task typed straight onto a date was chosen deliberately.
  if (!insert.placement) insert.placement = 'manual'
  if (!insert.origin_date) insert.origin_date = insert.task_date

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('todos').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json({ todo: data }, { status: 201 })
  } catch (err) {
    return serverError('todos.POST', err)
  }
}
