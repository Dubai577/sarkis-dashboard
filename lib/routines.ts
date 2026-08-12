/**
 * Which routines apply on a given date.
 *
 * The old implementation used `dayIndex % 2 === 0` for "alternating", which
 * lands on Mon/Wed/Fri/Sun and then resets every week — so Sunday and the
 * following Monday were both "on". Counting from a fixed anchor date makes it
 * genuinely every other day across week and month boundaries.
 */

import { dayIndex, type IsoDate } from '@/lib/dates'
import type { Routine } from '@/lib/types/entities'

const DAY = 86_400_000

function daysFrom(anchor: IsoDate, date: IsoDate): number {
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${anchor}T12:00:00Z`)) / DAY,
  )
}

export function routineAppliesOn(routine: Routine, date: IsoDate): boolean {
  if (!routine.is_active) return false

  switch (routine.cadence) {
    case 'daily':
      return true

    case 'weekly_on':
      return routine.weekday !== null && dayIndex(date) === routine.weekday

    case 'alternating': {
      if (!routine.anchor_date) return false
      // Modulo that stays correct for dates before the anchor.
      const delta = daysFrom(routine.anchor_date, date)
      return ((delta % 2) + 2) % 2 === 0
    }

    default:
      return false
  }
}

export function applicableRoutines(routines: Routine[], date: IsoDate): Routine[] {
  return routines
    .filter(r => routineAppliesOn(r, date))
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function cadenceLabel(routine: Routine): string {
  switch (routine.cadence) {
    case 'daily': return 'Every day'
    case 'alternating': return 'Every other day'
    case 'weekly_on': {
      const names = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
      return routine.weekday === null ? 'Weekly' : names[routine.weekday]
    }
    default: return ''
  }
}
