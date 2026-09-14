import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, serverError } from '@/lib/api/http'
import { addDays, today as todayIso, weekStart } from '@/lib/dates'
import { runSync } from '@/lib/db/sync'
import { possessionOf } from '@/lib/possession'
import { isForeign, followUpFor } from '@/lib/sync/exec-portal'

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

    const [todosRes, itemsRes, groupsRes, catRes] = await Promise.all([
      db.from('todos').select('*')
        .gte('task_date', from).lte('task_date', to)
        .order('task_date').order('sort_order'),
      db.from('items')
        .select('id,title,planned_date,due_date,category_id,waiting_on,waiting_since,nudge_after,parent_id,progress,external_source,external_uid')
        .is('archived_at', null)
        // One day wider on the due side: a foreign task due on `from` shows as
        // a follow-up the day before, which is inside the window it was
        // fetched for only if the fetch reaches one day past it.
        .or(`and(planned_date.gte.${from},planned_date.lte.${to}),and(due_date.gte.${from},due_date.lte.${addDays(to, 1)})`),
      // Parents are needed to tell whose group a task sits in; fetched once.
      db.from('items').select('id,title,external_uid').eq('is_group', true).is('archived_at', null),
      db.from('categories').select('id,name,color'),
    ])

    if (todosRes.error) throw todosRes.error
    if (itemsRes.error) throw itemsRes.error

    const byId = new Map((groupsRes.data ?? []).map(g => [g.id, g]))

    /**
     * A teammate's task is drawn as your follow-up, the day before it is due,
     * and never as their deadline. Their title is rewritten to what you do
     * about it; their due date is dropped so the calendar does not also mark
     * the day it is owed to someone else.
     */
    const items = (itemsRes.data ?? []).flatMap(i => {
      const follow = followUpFor(i, byId, now)
      if (follow) {
        if (follow.date < from || follow.date > to) return []
        return [{
          ...i,
          title: follow.title,
          planned_date: follow.date,
          due_date: null,
          possession: 'theirs' as const,
        }]
      }
      if (isForeign(i, byId)) return []   // foreign, no due date: not on your calendar
      if (i.progress === 'done') return []
      return [{ ...i, possession: possessionOf(i, now) }]
    })

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
