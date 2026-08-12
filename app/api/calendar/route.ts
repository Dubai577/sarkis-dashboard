import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, serverError } from '@/lib/api/http'
import { addDays, today as todayIso, weekStart } from '@/lib/dates'
import { runSync } from '@/lib/db/sync'
import { possessionOf } from '@/lib/possession'

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One range endpoint behind all three views. Day, week and month differ only in
 * the range they ask for, which is what lets them switch without losing
 * position and guarantees they can never disagree about what is on a date.
 *
 * There is no calendar store: this is a second projection of the same todos the
 * week list reads, plus items carrying their own dates.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const params = req.nextUrl.searchParams
  const now = todayIso()

  // `month=YYYY-MM` is still accepted so older links keep working.
  const month = params.get('month')
  let from = params.get('from')
  let to = params.get('to')

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return badRequest('month must be YYYY-MM.')
    from = addDays(`${month}-01`, -7)
    to = addDays(`${month}-01`, 44)
  }

  if (!isIsoDate(from) || !isIsoDate(to)) {
    return badRequest('from and to must be YYYY-MM-DD dates.')
  }
  if (from > to) return badRequest('from must be on or before to.')

  try {
    // Materializing is safe to repeat and populates a future range the first
    // time it is opened. Rollover is deliberately not run here — it may only
    // ever touch the current week.
    await runSync(now)

    const db = createAdminClient()

    const [todosRes, itemsRes, catRes] = await Promise.all([
      db.from('todos').select('*')
        .gte('task_date', from).lte('task_date', to)
        .order('task_date').order('sort_order'),
      db.from('items')
        .select('id,title,planned_date,due_date,category_id,waiting_on,waiting_since,nudge_after')
        .is('archived_at', null)
        .or(`and(planned_date.gte.${from},planned_date.lte.${to}),and(due_date.gte.${from},due_date.lte.${to})`),
      db.from('categories').select('id,name,color'),
    ])

    if (todosRes.error) throw todosRes.error
    if (itemsRes.error) throw itemsRes.error

    const items = (itemsRes.data ?? []).map(i => ({
      ...i,
      possession: possessionOf(i, now),
    }))

    return NextResponse.json({
      from,
      to,
      today: now,
      currentWeek: weekStart(now),
      todos: todosRes.data ?? [],
      items,
      categories: catRes.data ?? [],
    })
  } catch (err) {
    return serverError('calendar.GET', err)
  }
}
