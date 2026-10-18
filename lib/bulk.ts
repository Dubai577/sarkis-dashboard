/**
 * Turning a pasted brain-dump into rows.
 *
 * The thing people actually paste is not a tidy list. It is bullets and bare
 * lines mixed together, headers with a colon, a bare URL on its own line, a
 * couple of lines indented under something, and no consistency at all —
 * because it was written to be read by the person who wrote it.
 *
 * The previous parser treated ANY line starting with "- " as a child of the
 * line above it. On a paste where almost every line is bulleted, that nests
 * the entire list under its first row. These rules fit what gets pasted:
 *
 *   "Header:"        a line ending in a colon opens a group; the bare lines
 *                    under it become its children, until a bulleted line or
 *                    another header closes it
 *   "- thing"        a task. A bullet at the left margin always means top
 *                    level, never a child
 *   "  thing"        indented: a child of the row above, whatever came before
 *   "https://…"      a URL alone attaches to the row above as its link
 *   "thing https://" text becomes the title, the URL becomes the link
 *
 * Dependency-free so the preview in the browser and the write on the server
 * run the identical code — a preview that can disagree with what gets saved
 * is worse than no preview.
 */

export interface BulkRow {
  title: string
  link?: string | null
  /** A header line: becomes a container with its lines beneath it. */
  isGroup?: boolean
  children: { title: string; link?: string | null }[]
}

const BULLET = /^[-*•·‣>]+\s+/
const URL_ONLY = /^(https?:\/\/\S+)$/i
const URL_IN = /(https?:\/\/\S+)/i

/** Trailing colon, with nothing that looks like a sentence after it. */
const isHeader = (line: string) => /:$/.test(line) && line.length <= 60

export function parseBulk(text: string): BulkRow[] {
  const out: BulkRow[] = []
  let group: BulkRow | null = null

  const attach = (link: string) => {
    const last = out[out.length - 1]
    if (!last) return false
    const target = last.children.length > 0 ? last.children[last.children.length - 1] : last
    target.link = link
    return true
  }

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) { group = null; continue }   // a blank line closes a group

    const indented = /^(\s{2,}|\t)/.test(raw)
    const bulleted = BULLET.test(raw.trimStart())
    const line = raw.replace(/^\s+/, '').replace(BULLET, '').trim()
    if (!line) continue

    /**
     * A bare URL belongs to whatever came before it — unless it was bulleted,
     * which means the writer meant it as its own item. Without that exception a
     * bulleted link overwrites the link on the row above, silently losing one
     * of the two.
     */
    const only = line.match(URL_ONLY)
    if (only) {
      if (!bulleted && attach(only[1])) continue
      out.push({ title: only[1], link: only[1], children: [] })
      continue
    }

    // Text with a URL in it: keep the words, keep the link.
    let title = line
    let link: string | null = null
    const inside = line.match(URL_IN)
    if (inside) {
      link = inside[1]
      title = line.replace(inside[1], '').replace(/[\s,–—-]+$/, '').trim() || inside[1]
    }

    if (isHeader(title) && !bulleted) {
      group = { title: title.replace(/:$/, '').trim(), isGroup: true, children: [] }
      out.push(group)
      continue
    }

    // A bullet at the margin is always a new top-level row, and ends a group.
    if (bulleted && !indented) {
      group = null
      out.push({ title, link, children: [] })
      continue
    }

    if (indented && out.length > 0) {
      out[out.length - 1].children.push({ title, link })
      continue
    }

    if (group) { group.children.push({ title, link }); continue }

    out.push({ title, link, children: [] })
  }

  // A header nobody wrote anything under is just a task with a stray colon.
  for (const row of out) if (row.isGroup && row.children.length === 0) row.isGroup = false

  return out
}

export const countRows = (rows: BulkRow[]) =>
  rows.length + rows.reduce((n, r) => n + r.children.length, 0)

/**
 * Which parser a paste needs.
 *
 * The export format carries metadata after a pipe — "title | #Area !2026-01-01"
 * — and round-trips through lib/textformat. A brain-dump has none of that. The
 * page and the server both call this, so a preview can never disagree with
 * what gets written, which the old split between them did not guarantee.
 */
export const looksLikeExport = (text: string) =>
  text.split(/\r?\n/).some(l => !/^\s*#/.test(l) && l.includes('|'))

/** BulkRow in the shape lib/textformat's writer already understands. */
export function toTextNodes(rows: BulkRow[]) {
  return rows.map(r => ({
    title: r.title,
    link: r.link ?? undefined,
    children: r.children.map(c => ({ title: c.title, link: c.link ?? undefined, children: [] })),
  }))
}
