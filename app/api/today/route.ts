import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { today as todayIso, weekStart, addDays } from '@/lib/dates'
import { loadItemViews } from '@/lib/db/items'
import { runRollover } from '@/lib/db/rollover'
import { runSync } from '@/lib/db/sync'
import { applicableRoutines } from '@/lib/routines'
import type { Routine } from '@/lib/types/entities'

/**
 * Everything the Today screen needs, in one request.
 *
 * Also the lazy catch-up path: on Vercel Hobby a cron runs at most once a day
 * and within a ~1 hour window, so opening the app is the real guarantee that
 * rollover has happened. runRollover is idempotent and guarded by
 * rollover_state, so this cannot double-process a day the cron already walked.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const now = todayIso()
  const skipCatchUp = req.nextUrl.searchParams.get('catchup') === 'off'

  try {
    let rollover = null
    let sync = null
    if (!skipCatchUp) {
      rollover = await runRollover('lazy', now)
      sync = await runSync(now)
    }

    const db = createAdminClient()
    const thisWeek = weekStart(now)

    const [{ data: todayTodos }, { data: overdue }, { data: routines }, { data: checks }, items] =
      await Promise.all([
        db.from('todos').select('*').eq('task_date', now).order('sort_order'),
        // Overdue means previous WEEKS only — never earlier in the current week.
        db.from('todos').select('*').lt('week_start', thisWeek).eq('is_complete', false).order('task_date'),
        db.from('routines').select('*').eq('is_active', true).order('sort_order'),
        db.from('routine_checks').select('routine_id,check_date').eq('check_date', now),
        loadItemViews({ now }),
      ])

    const done = new Set((checks ?? []).map(c => c.routine_id))

    // Everything waiting past its nudge window, anywhere in the tree. This is
    // the state nothing else in the app surfaces.
    const dropped = items
      .filter(i => i.possession === 'dropped')
      .sort((a, b) => b.heat - a.heat)

    const rolled = (todayTodos ?? []).filter(t => (t.roll_count ?? 0) > 0)

    return NextResponse.json({
      date: now,
      weekStart: thisWeek,
      todos: todayTodos ?? [],
      rolled: rolled.map(t => t.id),
      overdue: overdue ?? [],
      dropped,
      routines: applicableRoutines((routines ?? []) as Routine[], now)
        .map(r => ({ ...r, checked: done.has(r.id) })),
      upcoming: items
        .filter(i => i.planned_date && i.planned_date > now && i.planned_date <= addDays(now, 7))
        .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
        .slice(0, 5),
      maintenance: { rollover, sync },
    })
  } catch (err) {
    return serverError('today.GET', err)
  }
}
