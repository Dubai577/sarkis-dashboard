/**
 * A minimal iCalendar reader — enough for a Canvas feed, and no more.
 *
 * RFC 5545 is large; a course feed uses a corner of it. Rather than pull a
 * parser and its dependency tree into the bundle for VEVENT/DTSTART/SUMMARY,
 * this handles the parts the feed actually emits and is honest about the rest.
 *
 * The two things a hand-rolled reader normally gets wrong, and which the Canvas
 * feed does use:
 *
 *   folding    a line longer than 75 octets continues on the next line,
 *              marked by a leading space or tab. Parsing line-by-line without
 *              unfolding truncates descriptions and, worse, splits a SUMMARY
 *              mid-course-code.
 *   escaping   commas, semicolons and newlines inside a value arrive escaped
 *              as \\, \\; \\n — a title reads "Concussion\\, Velocity" raw.
 *
 * Times come in two shapes here and both are handled:
 *   DTSTART;VALUE=DATE:20260827      an all-day deadline  (116 of 121)
 *   DTSTART:20260828T150000Z         an instant in UTC    (5 of 121)
 */

export interface IcsEvent {
  uid: string
  title: string
  /** YYYY-MM-DD in the feed's own terms. All-day events have no time. */
  date: string
  /** HH:MM, local to the viewer's zone, or null for an all-day event. */
  time: string | null
  /** The bracketed course code Canvas appends to every summary, if present. */
  course: string | null
  url: string | null
}

/** Join continuation lines back onto the line they belong to. */
export function unfold(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/** Reverse the text escaping RFC 5545 applies to values. */
export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

/**
 * Canvas suffixes every summary with the section code:
 *   "HW 1B [MSE_2034_88599_202609]"  ->  title "HW 1B", course "MSE 2034"
 *
 * The trailing CRN and term are noise on a dashboard; the subject and number
 * are what tell you which class it belongs to.
 */
export function splitSummary(summary: string): { title: string; course: string | null } {
  const m = summary.match(/^(.*?)\s*\[([A-Za-z]+)_(\d+)_[^\]]*\]\s*$/)
  if (!m) return { title: summary.trim(), course: null }
  return { title: m[1].trim(), course: `${m[2]} ${m[3]}` }
}

/**
 * A UTC instant becomes the calendar day and clock time a person in that zone
 * would see. A deadline at 20260828T150000Z is 11am Eastern, and showing it as
 * 15:00 — or worse, sliding it onto the wrong day — is the whole reason dates
 * live in one module in this codebase.
 */
function fromUtcStamp(stamp: string, timeZone: string) {
  const [, y, mo, d, h, mi] = stamp.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/)!
  const at = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi))
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(at)
  const get = (t: string) => parts.find(p => p.type === t)!.value
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`,
  }
}

export function parseIcs(raw: string, timeZone = 'America/New_York'): IcsEvent[] {
  const events: IcsEvent[] = []
  let current: Record<string, string> | null = null

  for (const line of unfold(raw)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue }
    if (line === 'END:VEVENT') {
      if (current) {
        const event = toEvent(current, timeZone)
        if (event) events.push(event)
      }
      current = null
      continue
    }
    if (!current) continue

    const colon = line.indexOf(':')
    if (colon < 0) continue
    // Strip parameters: "DTSTART;VALUE=DATE" is still a DTSTART.
    const name = line.slice(0, colon).split(';')[0].toUpperCase()
    const value = line.slice(colon + 1)
    // Canvas emits DTSTART twice on all-day rows (VALUE=DATE;VALUE=DATE);
    // first write wins so a later duplicate cannot clobber a good value.
    if (!(name in current)) current[name] = value
  }

  return events.sort((a, b) =>
    a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
}

function toEvent(fields: Record<string, string>, timeZone: string): IcsEvent | null {
  const start = fields.DTSTART
  if (!start || !fields.SUMMARY) return null

  let date: string
  let time: string | null = null

  if (/^\d{8}$/.test(start)) {
    date = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`
  } else if (/^\d{8}T\d{6}Z$/.test(start)) {
    ;({ date, time } = fromUtcStamp(start, timeZone))
  } else if (/^\d{8}T\d{6}$/.test(start)) {
    // Floating local time — already the wall clock, so no conversion.
    date = `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`
    time = `${start.slice(9, 11)}:${start.slice(11, 13)}`
  } else {
    return null
  }

  const { title, course } = splitSummary(unescapeText(fields.SUMMARY))
  if (!title) return null

  return {
    uid: fields.UID ?? `${date}-${title}`,
    title,
    date,
    time,
    course,
    url: fields.URL ?? null,
  }
}

/**
 * The window a dashboard cares about: nothing stale, nothing a term away.
 *
 * `from` is required rather than defaulted to today, which keeps this module
 * free of any import at all — dates come from the caller, so the one place
 * that knows the app's timezone stays the one place that decides "today".
 */
export function upcoming(events: IcsEvent[], from: string, days = 30): IcsEvent[] {
  const until = new Date(`${from}T12:00:00Z`)
  until.setUTCDate(until.getUTCDate() + days)
  const end = until.toISOString().slice(0, 10)
  return events.filter(e => e.date >= from && e.date <= end)
}
