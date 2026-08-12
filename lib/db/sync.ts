// Server-only by convention: imported solely by route handlers and cron.
import { createAdminClient } from '@/lib/supabase/admin'
import { today as todayIso, weekStart, addDays, type IsoDate } from '@/lib/dates'

/**
 * Materialize dated work into the week.
 *
 *   items.planned_date        → a todo
 *   sweat_tasks.my_due_date   → a todo
 *
 * The materialized row keeps a real foreign key back to its source
 * (source_item_id / source_sweat_id, one or the other, enforced by a CHECK),
 * so deleting or archiving the source removes it by cascade rather than by a
 * cleanup job that could silently fall behind.
 *
 * Uniqueness is one row per source WHILE INCOMPLETE, globally — a partial
 * unique index, not a per-week one. Per-week uniqueness would let a slipped
 * item reappear in every subsequent week, accumulating unchecked copies.
 *
 * A past-dated source lands on the next available date rather than on the date
 * that already went by, and origin_date keeps the date it was meant to happen,
 * so the slip stays visible instead of being quietly rewritten.
 *
 * Safe to run on every view: it inserts only what is missing.
 */

export interface SyncResult {
  created: number
  skipped: number
  detail: { source: string; title: string; landed: IsoDate; origin: IsoDate }[]
}

export async function runSync(now: IsoDate = todayIso()): Promise<SyncResult> {
  const db = createAdminClient()
  const result: SyncResult = { created: 0, skipped: 0, detail: [] }

  // Landing date: the intended date if it is still ahead, otherwise today.
  const landOn = (intended: IsoDate): IsoDate => (intended < now ? now : intended)

  const [{ data: items }, { data: sweat }, { data: existing }] = await Promise.all([
    db.from('items')
      .select('id,title,planned_date,category_id')
      .not('planned_date', 'is', null)
      .is('archived_at', null),
    db.from('sweat_tasks')
      .select('id,title,course,my_due_date,actual_due_date')
      .not('my_due_date', 'is', null)
      .eq('is_complete', false),
    db.from('todos')
      .select('id,source_item_id,source_sweat_id,is_complete')
      .eq('is_complete', false),
  ])

  const openItemSources = new Set(
    (existing ?? []).filter(t => t.source_item_id).map(t => t.source_item_id as string),
  )
  const openSweatSources = new Set(
    (existing ?? []).filter(t => t.source_sweat_id).map(t => t.source_sweat_id as string),
  )

  const rows: Record<string, unknown>[] = []

  for (const item of items ?? []) {
    if (openItemSources.has(item.id)) { result.skipped += 1; continue }
    const origin = item.planned_date as IsoDate
    const landed = landOn(origin)
    rows.push({
      title: item.title,
      task_date: landed,
      origin_date: origin,
      // Materialized, not chosen by hand — rollover may move it.
      placement: 'auto',
      source_item_id: item.id,
    })
    result.detail.push({ source: 'item', title: item.title, landed, origin })
  }

  for (const task of sweat ?? []) {
    if (openSweatSources.has(task.id)) { result.skipped += 1; continue }
    const origin = task.my_due_date as IsoDate
    const landed = landOn(origin)
    rows.push({
      title: `${task.course}: ${task.title}`,
      task_date: landed,
      origin_date: origin,
      placement: 'auto',
      source_sweat_id: task.id,
    })
    result.detail.push({ source: 'sweat', title: task.title, landed, origin })
  }

  if (rows.length === 0) return result

  // The partial unique index is the real guard. A concurrent view that
  // materialized the same source a moment earlier raises 23505; treat that as
  // "already done" rather than an error, which is what makes this safe to call
  // on every page view.
  const { data, error } = await db.from('todos').insert(rows).select('id')

  if (error) {
    if (error.code === '23505') {
      result.skipped += rows.length
      result.detail = []
      return result
    }
    throw error
  }

  result.created = data?.length ?? 0
  return result
}

/**
 * Completing a materialized todo, and its source, in one call.
 *
 * One write path on purpose. Two independent writes — one from the week view
 * and one from the project view — is exactly how a todo and its backlog item
 * end up disagreeing about whether the work is done.
 *
 * Unchecking reverts a Sarkis-style status to 'Working on it' rather than
 * 'Haven't Started', because unchecking means it turned out not to be finished,
 * not that it was never begun.
 */
export async function setTodoComplete(todoId: string, complete: boolean) {
  const db = createAdminClient()

  const { data: todo, error } = await db
    .from('todos')
    .select('id,source_item_id,source_sweat_id')
    .eq('id', todoId)
    .maybeSingle()

  if (error) throw error
  if (!todo) return null

  const stamp = complete ? new Date().toISOString() : null

  const { data: updated, error: writeErr } = await db
    .from('todos')
    .update({ is_complete: complete, completed_at: stamp })
    .eq('id', todoId)
    .select()
    .single()

  if (writeErr) throw writeErr

  if (todo.source_item_id) {
    await db.from('items').update({
      archived_at: stamp,
      status: complete ? 'Done' : 'Working on it',
    }).eq('id', todo.source_item_id)
  }

  if (todo.source_sweat_id) {
    await db.from('sweat_tasks')
      .update({ is_complete: complete })
      .eq('id', todo.source_sweat_id)
  }

  return updated
}

/** The week a materialized row belongs to, for the week view. */
export function weekOf(date: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = weekStart(date)
  return { start, end: addDays(start, 6) }
}
