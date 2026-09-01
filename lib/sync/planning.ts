/**
 * When you actually sit down to do the work.
 *
 * A due date is Canvas's fact. A planned date is yours, and setting 160 of
 * them by hand is not a plan, it is a chore — worse, a class shifting its
 * schedule would mean redoing all of them. So the plan is expressed once, per
 * class, as a rule, and re-derived whenever a deadline moves.
 *
 * Two shapes cover every rule asked for:
 *
 *   weekday   the last Wednesday before it is due — survives a deadline
 *             sliding within its week, which "two days before" would not
 *   offset    N days before it is due
 *
 * Then one rule applies to everything, and it wins: nothing is ever planned on
 * a Friday, Saturday or Sunday. A landing in the weekend walks BACK to
 * Thursday, never forward — forward would eat into the time remaining, and on
 * a Sunday deadline it would land after the thing was due.
 *
 * Exams are left alone. You do not "plan" an exam for Wednesday night; it
 * happens when it happens.
 *
 * Dependency-free on purpose: this is exercised directly by scripts as well as
 * by the sync, so it does its own date arithmetic, anchored at noon UTC where
 * no timezone shift can move the day.
 */

export type PlanRule =
  | { kind: 'weekday'; weekday: number }   // 0 Sun … 6 Sat
  | { kind: 'offset'; days: number }

/**
 * Per class. Anything not listed falls back to DEFAULT_RULE, which is stated
 * rather than silent so an unplanned class is visible rather than surprising.
 */
export const RULES: Record<string, PlanRule> = {
  // All three are due every Friday, so "the Wednesday before" is both the
  // requested Wednesday night and robust if a deadline slides within its week.
  'BMES 2004': { kind: 'weekday', weekday: 3 },
  'BMES 3004': { kind: 'weekday', weekday: 3 },
  'BMES 3224': { kind: 'weekday', weekday: 3 },
  // Deadlines land Thu/Tue/Wed/Fri, all of which have a Monday before them.
  'MSE 2034': { kind: 'weekday', weekday: 1 },
  // Work can be posted the same day, so there is no room for more than a day.
  'ISE 3434': { kind: 'offset', days: 1 },
  // Three days back puts a Sunday deadline on Thursday on its own, which is
  // what was asked for; the weekend guard never has to fire for that case.
  'EGR 240': { kind: 'offset', days: 3 },
}

export const DEFAULT_RULE: PlanRule = { kind: 'offset', days: 2 }

/** Saturday, Sunday, Friday — never a planning day. */
const BANNED = new Set([5, 6, 0])

/**
 * Real exams only.
 *
 * "Chapter 8: Crash Test Dummies" is an assignment, and a naive /test/ would
 * skip it. A number after the word is what separates "Test 1, Chapters 1 - 3"
 * from a chapter that happens to be about crash testing.
 */
export function isExam(title: string): boolean {
  return /\bfinal\s+exam\b|\bexam\s*\d|^exam\b|\bmidterm\b|\btest\s*\d/i.test(title.trim())
}

const dayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The planned date for one assignment, or null to leave it alone.
 *
 * Returns null for exams, and for anything whose rule would land on or after
 * the due date — a "plan" that is not before the deadline is not a plan.
 */
export function planFor(course: string | null, dueDate: string, title: string): string | null {
  if (isExam(title)) return null

  const rule = (course && RULES[course]) || DEFAULT_RULE

  let planned: string
  if (rule.kind === 'offset') {
    planned = shift(dueDate, -rule.days)
  } else {
    // Walk back to the most recent matching weekday STRICTLY before the due
    // date. Landing on the due date itself would mean planning to start it the
    // day it is owed.
    planned = shift(dueDate, -1)
    for (let i = 0; i < 7 && dayOf(planned) !== rule.weekday; i++) planned = shift(planned, -1)
  }

  // The rule that beats every other rule.
  for (let i = 0; i < 4 && BANNED.has(dayOf(planned)); i++) planned = shift(planned, -1)

  /**
   * The buffer is the whole point, so it is guaranteed rather than hoped for.
   *
   * This used to return null when the rule and the weekend guard conspired to
   * land on or after the deadline — and a null plan is precisely what surfaces
   * as "due" on the dashboard, so the one case that most needed a plan got
   * none. Step back to the last allowed day before the deadline instead.
   *
   * A planned date equal to its due date is not a plan, it is the deadline
   * wearing a different hat.
   */
  if (planned >= dueDate) {
    planned = shift(dueDate, -1)
    for (let i = 0; i < 6 && BANNED.has(dayOf(planned)); i++) planned = shift(planned, -1)
  }

  return planned
}
