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

export type Quadrant = 'do' | 'schedule' | 'pending' | 'drop'

export interface FocusInput {
  due_date?: string | null
  planned_date?: string | null
  important?: boolean | null
  progress?: string | null
  /** Set when the work sits with someone else. */
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

/**
 * Pending is checked first, and that is a deliberate departure.
 *
 * The textbook third quadrant is "delegate" — advice about what you SHOULD
 * do with a task. That is useless once you have actually delegated it: the
 * thing is no longer yours to do, but it is still yours to chase, and if it
 * drops off the board you find out when someone asks why it never happened.
 *
 * So Pending is a state, not a judgement: anything sitting with another
 * person. It outranks urgency and importance because "who has this" answers a
 * different question from "how much does it matter", and the first question
 * decides what you can actually do about it today — follow up, nothing else.
 *
 * Urgent-but-not-important still lands here too, which is the textbook advice
 * arriving at the same place: these are the ones to hand over.
 */
export function quadrantOf(item: FocusInput, today: string): Quadrant {
  if (item.waiting_on) return 'pending'
  const important = item.important === true
  const urgent = isUrgent(item, today)
  if (important && urgent) return 'do'
  if (important) return 'schedule'
  if (urgent) return 'pending'
  return 'drop'
}

export const QUADRANTS: {
  key: Quadrant
  title: string
  verb: string
  /** Which corner of the matrix this is, in the matrix's own words. */
  axes: string
  blurb: string
  /** CSS custom property holding the accent colour. */
  tone: string
}[] = [
  {
    key: 'do', title: 'Do', verb: 'Today',
    axes: 'Urgent + Important',
    blurb: 'A deadline or a real consequence, and it matters. This is the day.',
    tone: '--dropped',
  },
  {
    key: 'schedule', title: 'Schedule', verb: 'Pick a day',
    axes: 'Important, not urgent',
    blurb: 'Unclear deadline, but it builds something. Give it a day before the deadline gives it one.',
    tone: '--theirs',
  },
  {
    key: 'pending', title: 'Pending', verb: 'Chase it',
    axes: 'With someone else',
    blurb: 'Handed over, and still yours to chase. Also where urgent-but-minor belongs — those are the ones to give away.',
    tone: '--mine',
  },
  {
    key: 'drop', title: 'Not now', verb: 'Archive',
    axes: 'Neither',
    blurb: 'No deadline, not marked important. Most captured things live here, and that is fine until you pretend otherwise.',
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
