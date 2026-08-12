/**
 * Possession — the atom of the whole model.
 *
 *   mine     I owe someone something.
 *   theirs   Waiting on a person, and correctly doing nothing.
 *   dropped  Waited past the nudge window. It is mine again.
 *
 * `dropped` is DERIVED ON READ and never stored. The failure being modelled is
 * forgetting — if it were a status someone had to set, it would never get set,
 * because not thinking about the item is precisely the problem. Deriving it
 * means it appears *because* you stopped thinking about it.
 *
 * This is the single implementation. The UI and the email digests both import
 * it, so they cannot disagree about whether something has been dropped.
 */

import { addDays, today as todayIso, type IsoDate } from '@/lib/dates'

export type Possession = 'mine' | 'theirs' | 'dropped'

/** The minimum an item needs for possession to be resolved. */
export interface PossessionInput {
  waiting_on: string | null
  waiting_since: IsoDate | null
  nudge_after: number | null
}

export const DEFAULT_NUDGE_DAYS = 7

export function possessionOf(
  item: PossessionInput,
  now: IsoDate = todayIso(),
): Possession {
  if (!item.waiting_on) return 'mine'
  if (!item.waiting_since) return 'theirs'

  const nudge = item.nudge_after ?? DEFAULT_NUDGE_DAYS
  const due = addDays(item.waiting_since, nudge)

  // Due today still counts as theirs; it tips the following day.
  return now > due ? 'dropped' : 'theirs'
}

/** Whole days spent waiting. Null when not waiting. */
export function daysWaiting(
  item: PossessionInput,
  now: IsoDate = todayIso(),
): number | null {
  if (!item.waiting_on || !item.waiting_since) return null
  const ms = Date.parse(`${now}T12:00:00Z`) - Date.parse(`${item.waiting_since}T12:00:00Z`)
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** Days until this becomes dropped. Negative once overdue. Null when not waiting. */
export function daysUntilNudge(
  item: PossessionInput,
  now: IsoDate = todayIso(),
): number | null {
  const waited = daysWaiting(item, now)
  if (waited === null) return null
  return (item.nudge_after ?? DEFAULT_NUDGE_DAYS) - waited
}

export const POSSESSION_LABEL: Record<Possession, string> = {
  mine: 'On me',
  theirs: 'Waiting',
  dropped: 'Needs a nudge',
}

/**
 * Ordering weight. Dropped first — it is the state that quietly kills projects
 * and the only one nothing else in the app surfaces.
 */
export const POSSESSION_WEIGHT: Record<Possession, number> = {
  dropped: 0,
  mine: 1,
  theirs: 2,
}
