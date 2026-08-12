import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, isIsoDate, readJson, serverError } from '@/lib/api/http'
import { today as todayIso, addDays } from '@/lib/dates'
import { applicableRoutines } from '@/lib/routines'
import type { Routine } from '@/lib/types/entities'

/**
 * GET /api/routines?date=YYYY-MM-DD
 *
 * The routines that apply on that date, each with whether it is checked, plus a
 * seven-day streak window for the strip.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const date = req.nextUrl.searchParams.get('date') ?? todayIso()
  if (!isIsoDate(date)) return badRequest('date must be a YYYY-MM-DD date.')

  try {
    const db = createAdminClient()
    const from = addDays(date, -6)

    const [{ data: routines, error }, { data: checks }] = await Promise.all([
      db.from('routines').select('*').eq('is_active', true).order('sort_order'),
      db.from('routine_checks').select('routine_id,check_date').gte('check_date', from).lte('check_date', date),
    ])
    if (error) throw error

    const done = new Set((checks ?? []).map(c => `${c.routine_id}|${c.check_date}`))
    const applicable = applicableRoutines((routines ?? []) as Routine[], date)

    return NextResponse.json({
      date,
      routines: applicable.map(r => ({
        ...r,
        checked: done.has(`${r.id}|${date}`),
        // Trailing week, for the expanded view. Only days the routine applies.
        week: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(from, i)
          return { date: d, checked: done.has(`${r.id}|${d}`) }
        }),
      })),
    })
  } catch (err) {
    return serverError('routines.GET', err)
  }
}

/** POST /api/routines — toggle one routine on one date. */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const { routine_id, date, checked } = body
  if (typeof routine_id !== 'string') return badRequest('routine_id is required.')
  if (!isIsoDate(typeof date === 'string' ? date : null)) {
    return badRequest('date must be a YYYY-MM-DD date.')
  }

  try {
    const db = createAdminClient()

    if (checked) {
      // Keyed on (routine_id, check_date), so double-tapping is harmless.
      const { error } = await db
        .from('routine_checks')
        .upsert({ routine_id, check_date: date }, { onConflict: 'routine_id,check_date' })
      if (error) throw error
    } else {
      const { error } = await db
        .from('routine_checks')
        .delete()
        .eq('routine_id', routine_id)
        .eq('check_date', date)
      if (error) throw error
    }

    return NextResponse.json({ ok: true, routine_id, date, checked: !!checked })
  } catch (err) {
    return serverError('routines.POST', err)
  }
}
