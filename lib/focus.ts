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

/** The matrix's own four. Pending is deliberately not one of them. */
export type Quadrant = 'do' | 'schedule' | 'delegate' | 'drop'

/** A quadrant, or the state of being out of your hands. */
export type Lane = Quadrant | 'pending'

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

/** Which of the four corners a task you still hold belongs in. */
export function quadrantOf(item: FocusInput, today: string): Quadrant {
  const important = item.important === true
  const urgent = isUrgent(item, today)
  if (important && urgent) return 'do'
  if (important) return 'schedule'
  if (urgent) return 'delegate'
  return 'drop'
}

/**
 * Pending is not a quadrant, and that distinction matters.
 *
 * Quadrant 3 is "urgent, not important" — the handout's examples are emails
 * and phone calls, an unexpected interruption from work, a favour for
 * someone. Things pulling at your attention right now that will not matter
 * next week. Its advice is to avoid them or give them away.
 *
 * Pending is what happens AFTER you give one away, and it can start life in
 * any of the four: a Q1 deadline handed to a teammate is still a Q1 deadline.
 * The matrix sorts work by how much it deserves from you; Pending answers a
 * different question — who has it — and the only move left to you is to
 * chase. So it sits beside the four rather than inside one.
 *
 * Work with someone else is listed only here. Leaving it in its quadrant
 * would put a task you cannot act on into a list of tasks to act on.
 */
export const isPending = (item: FocusInput) => !!item.waiting_on

export function laneOf(item: FocusInput, today: string): Lane {
  return isPending(item) ? 'pending' : quadrantOf(item, today)
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
    key: 'delegate', title: 'Hand off or skip', verb: 'Give it away',
    axes: 'Urgent, not important',
    blurb: 'Pulling at you now, but it will not matter next week — a message to answer, a favour, an interruption. Give it to someone or let it go.',
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
/** Not a quadrant, so it carries its own description. */
export const PENDING = {
  title: 'Pending',
  verb: 'Follow up',
  blurb: 'Handed to someone else and kept here on purpose: not yours to do, still yours to remember. It leaves when they finish it or you take it back.',
  tone: '--theirs',
}

export function readOnDo(doCount: number, scheduleCount: number): string | null {
  if (doCount === 0) return null
  if (doCount <= 3) return null
  if (doCount <= 6) {
    return `${doCount} urgent and important. That is a full day — protect it from anything new.`
  }
  return `${doCount} things cannot all be today. Everything here was in Schedule once; `
    + `move what can wait back there with a real date, and do the rest in order.`
}
