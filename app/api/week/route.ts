import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, serverError } from '@/lib/api/http'
import { addDays, isMonday, today as todayIso, weekStart } from '@/lib/dates'
import { runSync } from '@/lib/db/sync'

/**
 * GET /api/week?start=YYYY-MM-DD  (a Monday)
 *
 * A week that has never been used is not a record that needs creating — it is
 * a date range with no rows in it. So "weeks are created on demand" needs no
 * write path at all: navigating to an empty future week simply returns nothing.
 *
 * Overdue is attached only for the current week. A past week already shows its
 * own unfinished rows, and a future week cannot be late.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const start = req.nextUrl.searchParams.get('start') ?? weekStart(todayIso())
  if (!isIsoDate(start)) return badRequest('start must be a YYYY-MM-DD date.')
  if (!isMonday(start)) return badRequest('start must be a Monday.')

  const now = todayIso()
  const current = weekStart(now)
  const end = addDays(start, 6)

  try {
    // Materializing is safe to repeat and populates a future week the first
    // time it is opened. Rollover is deliberately NOT run here — it must only
    // ever touch the current week.
    if (start >= current) await runSync(now)

    const db = createAdminClient()

    const { data: todos, error } = await db
      .from('todos')
      .select('*')
      .gte('task_date', start)
      .lte('task_date', end)
      .order('task_date')
      .order('sort_order')

    if (error) throw error

    let overdue: unknown[] = []
    if (start === current) {
      const { data } = await db
        .from('todos')
        .select('*')
        .lt('week_start', current)
        .eq('is_complete', false)
        .order('task_date')
      overdue = data ?? []
    }

    return NextResponse.json({
      start,
      end,
      isCurrent: start === current,
      isFuture: start > current,
      today: now,
      todos: todos ?? [],
      overdue,
    })
  } catch (err) {
    return serverError('week.GET', err)
  }
}
