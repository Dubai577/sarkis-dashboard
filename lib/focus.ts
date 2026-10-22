/**
 * The time matrix, as a zoomed-in view of today rather than a second home.
 *
 * Eisenhower has two axes: urgent, and important. The usual software version
 * asks you to set both by hand, and then both rot — "urgent" tagged three
 * weeks ago is a lie today, and nobody re-tags three hundred rows.
 *
 * This app already holds one axis as a fact: a due date IS urgency, and it
 * updates itself every midnight for free. So only the other axis is stored.
 *
 *   urgent      computed — late, or due within URGENT_WITHIN days
 *   important   yours — a judgment nothing else can make, plus one standing
 *               answer: coursework always counts
 *
 * The test this page has to pass: used every day for a year, it runs out of
 * work. Two things follow, and neither is in the handout.
 *
 * Only three boxes, not four. The handout's fourth corner is a bin for
 * distractions to delete — scrolling, meetings nobody needed. Nothing like
 * that reaches here, because the filtering happens before anything is typed
 * in. A box holding a hundred unjudged rows is not a quadrant, it is the
 * backlog, and the backlog has a page already.
 *
 * And anything with a day already on it is NOT here. You decided when; the
 * day will bring it back. Fifty assignments planned for later are fifty
 * decisions already made, and repeating them on this page is what turns a
 * list of what to do now into a list of everything.
 */

/** Due inside this many days counts as urgent. Late always does. */
export const URGENT_WITHIN = 3

/**
 * Where work can be on this page.
 *
 * `null` is the fourth answer and the load-bearing one: not here at all.
 */
export type Lane = 'do' | 'free' | 'clear' | 'pending'

export interface FocusInput {
  due_date?: string | null
  planned_date?: string | null
  important?: boolean | null
  progress?: string | null
  /** Set when the work sits with someone else. */
  waiting_on?: string | null
  /**
   * Coursework: it lives under the school project.
   *
   * Two things follow. It is important without being starred — a degree is
   * not a thing you re-decide to care about each week, and leaving it
   * unstarred put an assignment due tonight in the same box as a favour. And
   * its planned day counts as urgency, because that day was computed FROM the
   * deadline by the planning rules, so arriving at it means the deadline is
   * close enough that today is the day.
   */
  school?: boolean
}

const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000)

/**
 * Urgency comes from the deadline, never from the plan — with one exception.
 *
 * Planning something for tomorrow is a decision you made; it does not make
 * the thing urgent. Conflating the two is how everything ends up in Do: you
 * schedule it, the schedule makes it look urgent, and the boxes stop meaning
 * anything. Coursework is the exception, because its planned day is derived
 * from its deadline, so reaching that day is deadline information.
 */
export function isUrgent(item: FocusInput, today: string): boolean {
  if (item.school && item.planned_date && item.planned_date <= today) return true
  if (!item.due_date) return false
  return daysUntil(item.due_date, today) <= URGENT_WITHIN
}

/** Importance is a judgment, with one standing answer for coursework. */
export const isImportant = (item: FocusInput) =>
  item.important === true || item.school === true

/**
 * Pending is not a box, and that distinction matters.
 *
 * "Urgent, not important" is a favour with a date, a reply someone needs
 * today. Pending is what happens AFTER you hand something over, and it can
 * start life anywhere: a deadline handed to a teammate is still a deadline.
 * The matrix sorts work by what it deserves from you; Pending answers a
 * different question — who has it — and the only move left is to chase.
 */
export const isPending = (item: FocusInput) => !!item.waiting_on

/** No date at all and it matters: the Someday bucket, seen from here. */
export const isFreeTime = (item: FocusInput) =>
  isImportant(item) && !item.due_date && !item.planned_date

/**
 * A deadline is coming and no day has been chosen for it.
 *
 * Not a lane — a prompt. These are not today's work, so listing them beside
 * today's work would be the same mistake as showing everything; but they are
 * the one thing the matrix is actually famous for catching, so the page says
 * how many there are and offers to fix them in place.
 */
export const needsADay = (item: FocusInput, today: string) =>
  !isPending(item) && isImportant(item) && !isUrgent(item, today)
  && !!item.due_date && !item.planned_date

/**
 * Which lane, or none.
 *
 * Read the order. Handed off, then what is genuinely now, then the dateless
 * things that matter — and everything else is somebody else's page: work with
 * a day already on it, a deadline already scheduled for, and the long tail
 * nobody has judged yet. That omission is the whole design.
 */
export function laneOf(item: FocusInput, today: string): Lane | null {
  if (isPending(item)) return 'pending'
  const urgent = isUrgent(item, today)
  if (urgent && isImportant(item)) return 'do'
  if (isFreeTime(item)) return 'free'
  if (urgent) return 'clear'
  return null
}

export const LANES: {
  key: Lane
  title: string
  /** The one action this lane wants. */
  verb: string
  /** Which corner of the matrix this is, in the matrix's own words. */
  axes: string
  blurb: string
  /** Shown when the lane is empty. */
  empty: string
  /** CSS custom property holding the accent colour. */
  tone: string
}[] = [
  {
    key: 'do', title: 'Do now', verb: 'Today',
    axes: 'Urgent + important',
    blurb: 'Late, due inside three days, or the day the planner picked for it has arrived. '
      + 'Today, in deadline order.',
    empty: 'Nothing urgent and important. That is the goal, not a gap.',
    tone: '--dropped',
  },
  {
    key: 'free', title: 'Free time', verb: 'When a gap opens',
    axes: 'Important, no date',
    blurb: 'It matters and nothing is forcing it. Dateless on purpose — this is what you reach '
      + 'for when an hour frees up, in the order you ranked it.',
    empty: 'Nothing parked. Star something with no dates and it lands here.',
    tone: '--theirs',
  },
  {
    key: 'clear', title: 'If you get to it', verb: 'Fast, or not at all',
    axes: 'Urgent, not important',
    blurb: 'A clock is running but nothing of yours rides on it. Done is good, not done is '
      + 'fine. Take these only in a gap, and do not let one eat an afternoon.',
    empty: 'Nothing on someone else’s clock.',
    tone: '--mine',
  },
  {
    key: 'pending', title: 'Pending', verb: 'Follow up',
    axes: 'With someone else',
    blurb: 'Handed over and kept here on purpose: not yours to do, still yours to remember. '
      + 'It leaves when they finish it or you take it back.',
    empty: 'Nothing sitting with anyone else.',
    tone: '--theirs',
  },
]

export const laneMeta = (key: Lane) => LANES.find(l => l.key === key)!

/**
 * What the Do pile means, said plainly.
 *
 * Thresholds rather than a formula: six things is a hard day, a dozen is not
 * a day at all. Saying so is more use than a number on its own.
 */
export function readOnDo(doCount: number, needDay: number): string | null {
  if (doCount <= 3) return null
  if (doCount <= 6) {
    return `${doCount} urgent and important. That is a full day — protect it from anything new.`
  }
  return `${doCount} things cannot all be today. Work down the deadlines`
    + (needDay > 0
      ? `, then give days to the ${needDay} waiting for one — that is how this list stays short.`
      : ', and move what can wait onto a real day.')
}
