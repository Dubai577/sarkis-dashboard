/**
 * Heat — computed urgency, used for ordering and emphasis.
 *
 * The stored `priority` column cannot drive this: 42 of 82 items say "Soon",
 * so sorting by it mostly sorts noise. And no metric may read `status = 'Done'`
 * — of 137 rows ever imported, not one was marked Done, because finishing
 * something here means deleting it.
 *
 * So heat is derived from things the data actually records:
 *
 *   dropped       waiting past the nudge window                    strongest
 *   due date      proximity to a hard deadline
 *   planned date  proximity to an intended date
 *   staleness     days since anything in the subtree changed
 *   blocked kids  open children that are themselves dropped
 *
 * Deliberately never surfaced as a number. It orders lists and drives
 * emphasis; a score on screen would invite tuning it instead of doing the work.
 */

import { today as todayIso, type IsoDate } from '@/lib/dates'
import { possessionOf, daysWaiting, type PossessionInput } from '@/lib/possession'

export interface HeatInput extends PossessionInput {
  due_date: IsoDate | null
  planned_date: IsoDate | null
  updated_at: string | null
  /** Open children that are themselves dropped. */
  blocked_children?: number
  open_children?: number
}

const DAY = 86_400_000

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY)
}

/**
 * Proximity curve for a date: 0 when far off, rising steeply as it approaches,
 * and staying high once past rather than falling away — an overdue thing does
 * not become less urgent by ageing.
 */
function dateWeight(target: IsoDate | null, now: IsoDate, scale: number): number {
  if (!target) return 0
  const days = daysBetween(now, target)
  if (days < 0) return scale * 1.2          // overdue: above anything merely soon
  if (days === 0) return scale
  if (days <= 2) return scale * 0.8
  if (days <= 7) return scale * 0.5
  if (days <= 21) return scale * 0.2
  return scale * 0.05
}

export function heatOf(item: HeatInput, now: IsoDate = todayIso()): number {
  let heat = 0

  const possession = possessionOf(item, now)
  if (possession === 'dropped') {
    // Scales with how far past the window it is, so a month of silence
    // outranks a day.
    const waited = daysWaiting(item, now) ?? 0
    const over = Math.max(0, waited - (item.nudge_after ?? 7))
    heat += 40 + Math.min(30, over * 1.5)
  }

  heat += dateWeight(item.due_date, now, 35)
  heat += dateWeight(item.planned_date, now, 20)

  // Staleness, capped so an ancient untouched item cannot outrank a live one.
  if (item.updated_at) {
    const stale = Math.max(0, Math.round((Date.now() - Date.parse(item.updated_at)) / DAY))
    heat += Math.min(15, stale / 14)
  }

  heat += Math.min(20, (item.blocked_children ?? 0) * 8)

  // A parent with open children is live work; a bare one-liner is not.
  if ((item.open_children ?? 0) > 0) heat += 3

  return Math.round(heat * 10) / 10
}

/** Coarse bands, for emphasis. The number itself is never shown. */
export type HeatBand = 'critical' | 'warm' | 'steady' | 'quiet'

export function heatBand(heat: number): HeatBand {
  if (heat >= 40) return 'critical'
  if (heat >= 20) return 'warm'
  if (heat >= 6) return 'steady'
  return 'quiet'
}

/** Sort helper: hottest first, stable by title. */
export function byHeatDesc<T extends { heat: number; title: string }>(a: T, b: T): number {
  if (b.heat !== a.heat) return b.heat - a.heat
  return a.title.localeCompare(b.title)
}
