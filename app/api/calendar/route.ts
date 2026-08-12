import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, serverError } from '@/lib/api/http'
import { addDays, today as todayIso } from '@/lib/dates'

/**
 * GET /api/calendar?month=YYYY-MM
 *
 * The calendar is a second projection of the same rows the week view reads.
 * There is no calendar store and nothing to keep in sync. Items and Sweat come
 * along so planned dates and deadlines are visible, each tagged by kind so the
 * grid can render them distinctly.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const month = req.nextUrl.searchParams.get('month') ?? todayIso().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) return badRequest('month must be YYYY-MM.')

  // Pad either side so the leading and trailing cells of the grid, which
  // belong to neighbouring months, are populated too.
  const first = month + '-01'
  const from = addDays(first, -7)
  const to = addDays(first, 44)

  try {
    const db = createAdminClient()

    const [todosRes, itemsRes, sweatRes, catRes] = await Promise.all([
      db.from('todos').select('*')
        .gte('task_date', from).lte('task_date', to)
        .order('task_date').order('sort_order'),
      db.from('items')
        .select('id,title,planned_date,due_date,category_id,waiting_on,waiting_since,nudge_after')
        .is('archived_at', null)
        .not('planned_date', 'is', null)
        .gte('planned_date', from).lte('planned_date', to),
      db.from('sweat_tasks')
        .select('id,title,course,my_due_date,actual_due_date,is_complete')
        .not('my_due_date', 'is', null)
        .gte('my_due_date', from).lte('my_due_date', to),
      db.from('categories').select('id,name,color'),
    ])

    if (todosRes.error) throw todosRes.error

    return NextResponse.json({
      month,
      from,
      to,
      today: todayIso(),
      todos: todosRes.data ?? [],
      items: itemsRes.data ?? [],
      sweat: sweatRes.data ?? [],
      categories: catRes.data ?? [],
    })
  } catch (err) {
    return serverError('calendar.GET', err)
  }
}
