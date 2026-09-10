/**
 * Writing iCalendar, the mirror of lib/ics.ts.
 *
 * The same two things a naive writer gets wrong are the two a naive reader
 * gets wrong, in reverse: values must be escaped, and lines must be folded at
 * 75 octets. A calendar that imports fine into Google and silently drops the
 * title in Outlook is almost always an unfolded long SUMMARY.
 */

export interface IcsOut {
  uid: string
  /** All-day date, YYYY-MM-DD. */
  date: string
  title: string
  description?: string | null
  url?: string | null
}

/** The inverse of unescapeText: commas, semicolons, backslashes, newlines. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold to 75 octets, continuing with a leading space.
 *
 * Counted in UTF-8 bytes, not characters — a title with an em dash or an
 * accented name is longer on the wire than it looks, and folding by character
 * count produces lines that are still too long.
 */
export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Never split a multi-byte character: back off to a boundary.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    out.push(bytes.subarray(start, end).toString('utf8'))
    start = end
    limit = 74   // continuation lines carry a leading space
  }
  return out.join('\r\n ')
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** One day on, which is what DTEND means for an all-day event. */
function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function buildIcs(events: IcsOut[], name: string): string {
  const now = stamp(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Merc//Dashboard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(name)}`),
    // Google re-polls on its own schedule; this is a hint, not a guarantee.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ]

  for (const e of events) {
    const compact = e.date.replace(/-/g, '')
    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:${e.uid}@merc`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compact}`,
      `DTEND;VALUE=DATE:${nextDay(e.date).replace(/-/g, '')}`,
      fold(`SUMMARY:${escapeText(e.title)}`),
    )
    if (e.description) lines.push(fold(`DESCRIPTION:${escapeText(e.description)}`))
    if (e.url) lines.push(fold(`URL;VALUE=URI:${e.url}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
