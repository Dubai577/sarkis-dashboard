// Server-only by convention: imported solely by route handlers and cron.
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, dayIndex, today as todayIso, weekStart, type IsoDate } from '@/lib/dates'

/**
 * Rollover.
 *
 * Rules, all of them load-bearing:
 *
 *  - An unchecked task moves forward EXACTLY ONE DAY per day processed. It
 *    does not jump to today. Walking matters at the week boundary: a jump
 *    would drag a task from last Tuesday into the current week, where it would
 *    stop being overdue and quietly lose its lateness.
 *  - It stops at Sunday. Nothing crosses into a new week; surviving Sunday
 *    night is what makes something overdue, and overdue means previous weeks.
 *  - Manual placement is protected while its date is still ahead. Once the
 *    date passes unchecked it walks like anything else — otherwise a
 *    deliberately-placed task becomes invisible on a day view that defaults to
 *    today, which is the bug the flag was meant to prevent.
 *  - Completed tasks never move.
 *  - Provenance is data, never text. origin_date and roll_count are stored and
 *    the "(from 5/12)" tag is rendered, so it cannot accumulate the way the
 *    Apps Script version did.
 *
 * Idempotent: rollover_state.last_rolled_through records the last day walked,
 * so a second run the same day finds nothing to do. Both the cron and the
 * app-open catch-up call this same function, so they cannot double-process.
 */

export interface RolloverResult {
  ran: boolean
  from: IsoDate | null
  through: IsoDate
  daysWalked: number
  moved: number
  merged: number
  skipped: number
  detail: { date: IsoDate; moved: number; merged: number }[]
}

/**
 * Two tasks are EQUIVALENT — and therefore merged rather than duplicated —
 * when all of these hold:
 *
 *   · they land on the same date
 *   · both are incomplete
 *   · their titles match after trimming, lowercasing and collapsing whitespace
 *   · they come from the same source: both hand-made, or both materialized
 *     from the same item or the same Sweat assignment
 *
 * Title alone is not enough: two different projects can legitimately both have
 * a child called "follow up". Source identity is what makes a merge safe.
 */
export function equivalenceKey(row: {
  task_date: string
  title: string
  source_item_id: string | null
  source_sweat_id: string | null
}): string {
  const title = row.title.trim().toLowerCase().replace(/\s+/g, ' ')
  const source = row.source_item_id ?? row.source_sweat_id ?? 'own'
  return `${row.task_date}|${source}|${title}`
}

interface TodoRow {
  id: string
  title: string
  task_date: string
  is_complete: boolean
  placement: string
  origin_date: string | null
  roll_count: number
  sort_order: number
  source_item_id: string | null
  source_sweat_id: string | null
}

export async function runRollover(
  trigger: 'cron' | 'lazy' | 'manual',
  now: IsoDate = todayIso(),
): Promise<RolloverResult> {
  const db = createAdminClient()

  const { data: state } = await db
    .from('rollover_state').select('last_rolled_through').eq('id', true).maybeSingle()

  const last = state?.last_rolled_through ?? null

  // First ever run walks only yesterday→today rather than the whole history.
  const start = last ?? addDays(now, -1)

  const result: RolloverResult = {
    ran: false, from: last, through: now,
    daysWalked: 0, moved: 0, merged: 0, skipped: 0, detail: [],
  }

  if (start >= now) {
    // Already walked through today. Nothing to do — this is the idempotent path.
    return result
  }

  result.ran = true

  try {
    // Walk each missed day in sequence. A three-day gap processes three hops,
    // so roll_count reflects reality instead of collapsing into one.
    for (let day = addDays(start, 1); day <= now; day = addDays(day, 1)) {
      result.daysWalked += 1

      // Monday: the previous day is Sunday of the previous week. Nothing
      // crosses; those tasks are now overdue and stay where they are.
      if (dayIndex(day) === 0) {
        result.detail.push({ date: day, moved: 0, merged: 0 })
        continue
      }

      const source = addDays(day, -1)

      const { data: candidates, error } = await db
        .from('todos')
        .select('id,title,task_date,is_complete,placement,origin_date,roll_count,sort_order,source_item_id,source_sweat_id')
        .eq('task_date', source)
        .eq('is_complete', false)

      if (error) throw error

      const movable = (candidates ?? []) as TodoRow[]
      if (movable.length === 0) {
        result.detail.push({ date: day, moved: 0, merged: 0 })
        continue
      }

      // What is already sitting on the destination day, for the merge check.
      const { data: existing } = await db
        .from('todos')
        .select('id,title,task_date,is_complete,roll_count,source_item_id,source_sweat_id')
        .eq('task_date', day)
        .eq('is_complete', false)

      const occupied = new Map<string, { id: string; roll_count: number }>()
      for (const row of existing ?? []) {
        occupied.set(
          equivalenceKey({ ...row, task_date: day } as TodoRow),
          { id: row.id, roll_count: row.roll_count ?? 0 },
        )
      }

      let movedToday = 0
      let mergedToday = 0

      for (const row of movable) {
        // Protected while its chosen date is still ahead. Since `source` is
        // always before `day` and `day` is at most today, this cannot fire for
        // a genuinely future placement — it is here so the rule survives a
        // future change to the walk window.
        if (row.placement === 'manual' && row.task_date > now) {
          result.skipped += 1
          continue
        }

        const key = equivalenceKey({ ...row, task_date: day })
        const clash = occupied.get(key)

        if (clash) {
          // Merge rather than duplicate: keep the row already on the day, take
          // the higher roll_count so the signal is not lost, drop the mover.
          await db.from('todos')
            .update({ roll_count: Math.max(clash.roll_count, (row.roll_count ?? 0) + 1) })
            .eq('id', clash.id)
          await db.from('todos').delete().eq('id', row.id)
          mergedToday += 1
          continue
        }

        await db.from('todos').update({
          task_date: day,
          roll_count: (row.roll_count ?? 0) + 1,
          origin_date: row.origin_date ?? row.task_date,
          // A rolled task is no longer where anyone put it deliberately.
          placement: 'auto',
        }).eq('id', row.id)

        occupied.set(key, { id: row.id, roll_count: (row.roll_count ?? 0) + 1 })
        movedToday += 1
      }

      result.moved += movedToday
      result.merged += mergedToday
      result.detail.push({ date: day, moved: movedToday, merged: mergedToday })
    }

    await db.from('rollover_state')
      .update({ last_rolled_through: now, updated_at: new Date().toISOString() })
      .eq('id', true)

    await db.from('rollover_log').insert({
      trigger,
      from_date: last,
      through_date: now,
      days_walked: result.daysWalked,
      moved: result.moved,
      merged: result.merged,
      skipped: result.skipped,
      detail: result.detail,
    })

    return result
  } catch (err) {
    await db.from('rollover_log').insert({
      trigger,
      from_date: last,
      through_date: now,
      days_walked: result.daysWalked,
      moved: result.moved,
      merged: result.merged,
      skipped: result.skipped,
      detail: result.detail,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

/** Overdue means previous weeks only. Never anything inside the current week. */
export function overdueFilterDate(now: IsoDate = todayIso()): IsoDate {
  return weekStart(now)
}
