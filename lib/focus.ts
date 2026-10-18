/**
 * The time matrix, adapted rather than copied.
 *
 * Eisenhower has two axes: urgent, and important. The usual software version
 * asks you to set both by hand, and then both rot — "urgent" tagged three
 * weeks ago is a lie today, and nobody re-tags three hundred rows.
 *
 * This app already holds one axis as a fact: a due date IS urgency, and it
 * updates itself every midnight for free. So only the other axis is stored.
 * One flag, set once, that does not go stale: does this matter?
 *
 *   urgent      computed — late, or due within URGENT_WITHIN days
 *   important   yours — a judgment nothing else can make
 *
 * The four quadrants, and the verb each one actually wants:
 *
 *   DO        important + urgent      the real list for today
 *   SCHEDULE  important + not urgent  give it a planned date, before it
 *                                     becomes Q1 by neglect
 *   DELEGATE  urgent + not important  hand it to someone, which this app
 *                                     already models as waiting_on
 *   DROP      neither                 archive it and stop carrying it
 *
 * The honest part, and the reason for the whole exercise: a Q1 that keeps
 * overflowing is not a workload problem, it is Q2 arriving late. Every item
 * in Q1 was in Q2 once. The page says so rather than just colouring things
 * red, because a matrix that only shows you thirty urgent things is an
 * indictment, not a tool.
 */

/** Due inside this many days counts as urgent. Late always does. */
export const URGENT_WITHIN = 3

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop'

export interface FocusInput {
  due_date?: string | null
  planned_date?: string | null
  important?: boolean | null
  progress?: string | null
  waiting_on?: string | null
}

const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000)

/**
 * Urgency comes from the deadline, never the plan.
 *
 * Planning something for tomorrow is a decision you made; it does not make
 * the thing urgent. Conflating the two is how every task ends up in Q1 — you
 * schedule it, the schedule makes it look urgent, and the quadrant stops
 * meaning anything.
 */
export function isUrgent(item: FocusInput, today: string): boolean {
  if (!item.due_date) return false
  return daysUntil(item.due_date, today) <= URGENT_WITHIN
}

export function quadrantOf(item: FocusInput, today: string): Quadrant {
  const important = item.important === true
  const urgent = isUrgent(item, today)
  if (important && urgent) return 'do'
  if (important) return 'schedule'
  if (urgent) return 'delegate'
  return 'drop'
}

export const QUADRANTS: {
  key: Quadrant
  title: string
  verb: string
  blurb: string
  /** CSS custom property holding the accent colour. */
  tone: string
}[] = [
  {
    key: 'do', title: 'Do', verb: 'Today',
    blurb: 'Important, and the deadline is here.',
    tone: '--dropped',
  },
  {
    key: 'schedule', title: 'Schedule', verb: 'Pick a day',
    blurb: 'Important, no deadline pressing. This is where a calm week is built — and where everything in Do came from.',
    tone: '--theirs',
  },
  {
    key: 'delegate', title: 'Hand off', verb: 'Waiting on',
    blurb: 'A deadline, but not yours to carry. Give it to someone, or decide it matters after all.',
    tone: '--mine',
  },
  {
    key: 'drop', title: 'Not now', verb: 'Archive',
    blurb: 'No deadline, not marked important. Most captured things live here, and that is fine — until you pretend otherwise.',
    tone: '--border-2',
  },
]

/**
 * What the Do pile means, said plainly.
 *
 * Thresholds rather than a formula: six things is a hard day, a dozen is not
 * a day at all. Saying so is more use than a number on its own.
 */
export function readOnDo(doCount: number, scheduleCount: number): string | null {
  if (doCount === 0) return null
  if (doCount <= 3) return null
  if (doCount <= 6) {
    return `${doCount} urgent and important. That is a full day — protect it from anything new.`
  }
  return `${doCount} things cannot all be today. Everything here was in Schedule once; `
    + `move what can wait back there with a real date, and do the rest in order.`
}
