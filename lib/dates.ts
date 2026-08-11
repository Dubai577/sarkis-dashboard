/**
 * The one place dates are computed. Client, route handlers and cron all import
 * from here; nothing else does date arithmetic.
 *
 * Two rules this module exists to enforce:
 *
 * 1. A calendar date is always resolved in America/New_York, never in the
 *    host's zone. Vercel functions run in UTC, so `new Date().getDay()` on the
 *    server is the UTC weekday — which is how the Sunday 19:00 ET recap ended
 *    up computing Monday.
 *
 * 2. A calendar date is never produced by calling .toISOString() on a Date
 *    built from local parts. That converts to UTC first, so any evening in
 *    Eastern lands on tomorrow.
 *
 * `.toISOString()` IS used below, but only on Dates deliberately anchored at
 * 12:00 UTC, where the calendar date cannot shift. Date-only values are passed
 * around as 'YYYY-MM-DD' strings, never as Date objects.
 */

export const APP_TIMEZONE = 'America/New_York'

/** Monday-first, matching todos.day_of_week and the week view. */
export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export type DayName = (typeof DAY_NAMES)[number]
/** A calendar date, 'YYYY-MM-DD'. */
export type IsoDate = string

// ── formatters ───────────────────────────────────────────────────
// en-CA renders as YYYY-MM-DD, which is exactly the shape a `date` column wants.

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
})

const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE, hour: 'numeric', hour12: false,
})

// ── core ─────────────────────────────────────────────────────────

/**
 * Anchor a calendar date at midday UTC. Midday keeps every ±12h offset on the
 * same calendar day, so day arithmetic never trips over a DST boundary.
 */
function anchor(date: IsoDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

function fromAnchor(d: Date): IsoDate {
  return d.toISOString().slice(0, 10)
}

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** Today's calendar date in Eastern, for any instant. */
export function today(instant: Date = new Date()): IsoDate {
  return dateFormatter.format(instant)
}

/** The Eastern hour (0–23) of an instant. Used to gate the cron handlers. */
export function easternHour(instant: Date = new Date()): number {
  return Number(hourFormatter.format(instant))
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = anchor(date)
  d.setUTCDate(d.getUTCDate() + days)
  return fromAnchor(d)
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(date: IsoDate): number {
  return (anchor(date).getUTCDay() + 6) % 7
}

export function dayName(date: IsoDate): DayName {
  return DAY_NAMES[dayIndex(date)]
}

/** The Monday on or before `date`. */
export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, -dayIndex(date))
}

/** The Monday of the week containing `instant`, resolved in Eastern. */
export function currentWeekStart(instant: Date = new Date()): IsoDate {
  return weekStart(today(instant))
}

/** The date of `day` within the week beginning `monday`. */
export function dateForDay(monday: IsoDate, day: DayName | number): IsoDate {
  const index = typeof day === 'number' ? day : DAY_NAMES.indexOf(day)
  return addDays(monday, index < 0 ? 0 : index)
}

/** Shift a week-start by whole weeks. Negative goes back. */
export function shiftWeeks(monday: IsoDate, weeks: number): IsoDate {
  return addDays(monday, weeks * 7)
}

export function isMonday(date: IsoDate): boolean {
  return dayIndex(date) === 0
}

// ── display ──────────────────────────────────────────────────────

/** "8/11" — the compact label on the day selector. */
export function shortLabel(date: IsoDate): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

/** "Tuesday, August 11" — for email subjects and headings. */
export function longLabel(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric',
  }).format(anchor(date))
}

/** "Aug 11" */
export function mediumLabel(date: IsoDate): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric',
  }).format(anchor(date))
}
