// Server-only by convention: imported solely by route handlers and cron.
import { createAdminClient } from '@/lib/supabase/admin'
import { today as todayIso, weekStart, addDays, type IsoDate } from '@/lib/dates'

/**
 * Materialize dated work into the week.
 *
 *   items.planned_date  →  a todo
 *
 * Coursework used to come from sweat_tasks; migration 012 moved it into items,
 * so it now arrives through the same path as everything else.
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
  /** Open mirrors moved because their source's planned date changed. */
  moved: number
  /** Open mirrors removed because their source lost its planned date. */
  removed: number
  skipped: number
  detail: { source: string; title: string; landed: IsoDate; origin: IsoDate }[]
}

export async function runSync(now: IsoDate = todayIso()): Promise<SyncResult> {
  const db = createAdminClient()
  const result: SyncResult = { created: 0, moved: 0, removed: 0, skipped: 0, detail: [] }

  // Landing date: the intended date if it is still ahead, otherwise today.
  const landOn = (intended: IsoDate): IsoDate => (intended < now ? now : intended)

  const [{ data: items }, { data: sweat }, { data: existing }] = await Promise.all([
    db.from('items')
      .select('id,title,planned_date,category_id')
      .not('planned_date', 'is', null)
      .is('archived_at', null),
    // sweat_tasks is retired: migration 012 moved coursework into items, so the
    // item branch below already covers it. Reading both would double-materialize.
    Promise.resolve({ data: [] as { id: string; title: string; course: string; my_due_date: string | null }[] }),
    // Completed rows count too. Completing a synced todo no longer archives its
    // source, so matching only open rows would re-materialize everything the
    // moment it was ticked off.
    db.from('todos').select('id,source_item_id,source_sweat_id,origin_date,is_complete,placement'),
  ])

  /**
   * Open mirrors, by source. When a source's planned date changes, its open
   * mirror MOVES rather than a second one being inserted: the partial unique
   * index allows one open row per source, so the insert this used to attempt
   * was rejected with 23505 and swallowed as "already done" — which left the
   * old todo where it was, and rollover then walked it onto today. Changing a
   * planned date looked like it did nothing.
   *
   * origin_date is what the mirror was made FOR; task_date is where rollover
   * has carried it. Comparing the plan to origin_date, not task_date, is what
   * keeps this from snapping a rolled-over todo back every morning.
   *
   * Only auto-placed mirrors move. A todo you dragged to a day by hand is a
   * decision, and a changed plan on the item does not overrule it.
   */
  const openBySource = new Map(
    (existing ?? [])
      .filter(t => t.source_item_id && !t.is_complete)
      .map(t => [t.source_item_id as string, t]),
  )
  const plannedIds = new Set((items ?? []).map(i => i.id))

  for (const item of items ?? []) {
    const open = openBySource.get(item.id)
    if (!open || open.origin_date === item.planned_date || open.placement !== 'auto') continue
    const origin = item.planned_date as IsoDate
    const { error } = await db
      .from('todos')
      .update({ task_date: landOn(origin), origin_date: origin, roll_count: 0, title: item.title })
      .eq('id', open.id)
    if (error) throw error
    result.moved += 1
  }

  // A source that lost its plan (or was archived) leaves an orphan mirror on
  // the day. Remove it — by its own id, never by pattern.
  for (const [sourceId, open] of openBySource) {
    if (plannedIds.has(sourceId) || open.placement !== 'auto') continue
    const { error } = await db.from('todos').delete().eq('id', open.id)
    if (error) throw error
    result.removed += 1
  }

  /**
   * Already materialized, keyed by source AND the date it was materialized for.
   * Moving a source's planned_date to a new day legitimately produces a new
   * todo; ticking one off does not bring it back.
   */
  const seen = new Set(
    (existing ?? [])
      .filter(t => t.source_item_id || t.source_sweat_id)
      .map(t => `${t.source_item_id ?? t.source_sweat_id}|${t.origin_date}`),
  )

  const rows: Record<string, unknown>[] = []

  for (const item of items ?? []) {
    if (seen.has(`${item.id}|${item.planned_date}`)) { result.skipped += 1; continue }
    // Moved above; it now carries this plan.
    if (openBySource.has(item.id)) { result.skipped += 1; continue }
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
 * Unchecking reverts the status to 'Working on it' rather than 'Haven't
 * Started', because unchecking means it turned out not to be finished, not that
 * it was never begun.
 *
 * Completing does NOT archive the source item. Ticking a box in the week view
 * should not make something vanish from the backlog board — that is the
 * deletion habit the archive rule exists to replace. Archiving stays an
 * explicit action from item detail.
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
    /**
     * Write progress, not status.
     *
     * This set status to 'Done' / 'Working on it' — the legacy column from
     * sarkis_tasks that nothing reads and that migration 017 replaced. So
     * ticking a task off the day left the item itself looking untouched
     * everywhere else: the same commitment disagreeing with itself, which is
     * the exact failure this single write path exists to prevent.
     *
     * Worse, status is also where 'Ongoing' lives. Writing 'Done' over it
     * silently erased the fact that something was deliberately undated.
     */
    await db.from('items')
      .update({ progress: complete ? 'done' : null })
      .eq('id', todo.source_item_id)
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
