/**
 * The plain-text interchange format.
 *
 * ONE module, used by both the exporter and the bulk importer, so what is
 * written can always be read back. If these were two implementations they would
 * drift, and a round trip would quietly lose fields.
 *
 * Shape of a line:
 *
 *     title | annotations
 *
 * The pipe separates the human part from the machine part. Everything before it
 * is the title verbatim — titles here contain '&', '$', '#', '.', apostrophes
 * and em dashes, so annotations cannot be sniffed out of free text. Nothing
 * before the pipe is parsed.
 *
 * Annotations, space separated, all optional, any order:
 *
 *     #Category        category name          #Convent   #{OCCM VT}
 *     @2026-09-01      planned date — when I intend to do it
 *     !2026-09-15      due date — the real deadline
 *     ~Name            waiting on this person ~Fady      ~{Fady Mansour}
 *     ^7               nudge after N days (default 7)
 *     +Urgent          priority: Urgent | Soon | Whenever | N/A
 *     %working         status: notstarted | working | done
 *     *pinned          board: pinned | muted   (default is auto)
 *     &{https://…}     a link — the portal, doc or form where the work lives
 *
 * Multi-word values go in braces: #{OCCM VT}, ~{Fady Mansour}.
 *
 * Indentation makes a line a child of the line above. Two spaces, a tab, or a
 * leading '-' all count. Nesting goes one level in the export; deeper is
 * accepted on import.
 *
 * A line beginning '>' is a note attached to the line above. Several '>' lines
 * in a row become one multi-line note.
 *
 * A line beginning '[x]' is archived. Archived items are exported into their
 * own section so they are never confused with live work.
 *
 * A line whose first non-space character is '#' is a comment, always. Blank
 * lines are ignored. A category annotation is only read after the pipe, so the
 * two can never collide — but it does mean a TITLE cannot begin with '#'.
 */

export interface TextNode {
  title: string
  children: TextNode[]
  notes?: string
  category?: string
  planned_date?: string
  due_date?: string
  waiting_on?: string
  nudge_after?: number
  priority?: string
  status?: string
  board?: 'auto' | 'pinned' | 'muted'
  archived?: boolean
  link?: string
}

const STATUS_TO_TOKEN: Record<string, string> = {
  "Haven't Started": 'notstarted',
  'Working on it': 'working',
  'Done': 'done',
}
const TOKEN_TO_STATUS: Record<string, string> = {
  notstarted: "Haven't Started",
  working: 'Working on it',
  done: 'Done',
}

/** Braces only when the value would otherwise be ambiguous. */
function wrap(value: string): string {
  return /\s/.test(value) ? `{${value}}` : value
}

// ── serialize ────────────────────────────────────────────────────

function annotationsFor(node: TextNode): string {
  const parts: string[] = []
  if (node.category) parts.push(`#${wrap(node.category)}`)
  if (node.planned_date) parts.push(`@${node.planned_date}`)
  if (node.due_date) parts.push(`!${node.due_date}`)
  if (node.waiting_on) parts.push(`~${wrap(node.waiting_on)}`)
  if (node.nudge_after && node.nudge_after !== 7) parts.push(`^${node.nudge_after}`)
  if (node.priority && node.priority !== 'N/A') parts.push(`+${wrap(node.priority)}`)
  if (node.status && STATUS_TO_TOKEN[node.status]) parts.push(`%${STATUS_TO_TOKEN[node.status]}`)
  if (node.board && node.board !== 'auto') parts.push(`*${node.board}`)
  // Always braced: a URL can contain '&', '?' and '=', any of which would
  // otherwise look like the start of the next annotation.
  if (node.link) parts.push(`&{${node.link}}`)
  return parts.join(' ')
}

export function serializeNode(node: TextNode, depth = 0): string {
  const indent = '  '.repeat(depth)
  const mark = node.archived ? '[x] ' : ''
  const annotations = annotationsFor(node)
  // A pipe inside a title would break the split, so escape it.
  const title = node.title.replace(/\|/g, '\\|').trim()

  const lines = [`${indent}${mark}${title}${annotations ? ` | ${annotations}` : ''}`]

  if (node.notes) {
    for (const line of node.notes.split(/\r?\n/)) {
      lines.push(`${indent}> ${line}`)
    }
  }
  for (const child of node.children) lines.push(serializeNode(child, depth + 1))

  return lines.join('\n')
}

export function serializeTree(nodes: TextNode[]): string {
  return nodes.map(n => serializeNode(n, 0)).join('\n')
}

// ── parse ────────────────────────────────────────────────────────

function readAnnotations(text: string): Partial<TextNode> {
  const out: Partial<TextNode> = {}
  // sigil + either {braced value} or a run of non-space characters
  const pattern = /([#@!~^+%*&])(?:\{([^}]*)\}|(\S+))/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    const sigil = match[1]
    const value = (match[2] ?? match[3] ?? '').trim()
    if (!value) continue

    switch (sigil) {
      case '#': out.category = value; break
      case '@': if (/^\d{4}-\d{2}-\d{2}$/.test(value)) out.planned_date = value; break
      case '!': if (/^\d{4}-\d{2}-\d{2}$/.test(value)) out.due_date = value; break
      case '~': out.waiting_on = value; break
      case '^': {
        const days = Number(value)
        if (Number.isFinite(days) && days > 0 && days < 400) out.nudge_after = days
        break
      }
      case '+': out.priority = value; break
      case '%': if (TOKEN_TO_STATUS[value.toLowerCase()]) out.status = TOKEN_TO_STATUS[value.toLowerCase()]; break
      case '*': if (value === 'pinned' || value === 'muted') out.board = value; break
      // http(s) only — the database constraint rejects anything else anyway.
      case '&': if (/^https?:\/\/\S+$/i.test(value)) out.link = value; break
    }
  }
  return out
}

/** How deeply a line is indented, in levels. */
function depthOf(raw: string): number {
  const leading = raw.match(/^[\t ]*/)?.[0] ?? ''
  const spaces = leading.replace(/\t/g, '  ').length
  return Math.floor(spaces / 2)
}

export function parseText(text: string): TextNode[] {
  const roots: TextNode[] = []
  /** The most recent node at each depth, so a child can find its parent. */
  const stack: TextNode[] = []
  let last: TextNode | null = null

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue

    // A '#' as the first non-space character is always a comment. There is no
    // exception for lines containing a pipe: the header block documents the
    // pipe syntax, and exempting those made four comment lines per file parse
    // as items. A '#Category' annotation only ever appears AFTER a pipe, so it
    // can never be at the start of a line.
    if (/^\s*#/.test(raw)) continue
    if (/^\s*\/\//.test(raw)) continue

    const noteMatch = raw.match(/^[\t ]*>\s?(.*)$/)
    if (noteMatch) {
      if (last) last.notes = last.notes ? `${last.notes}\n${noteMatch[1]}` : noteMatch[1]
      continue
    }

    const depth = depthOf(raw)
    let body = raw.trim()

    let archived = false
    if (/^\[[xX]\]\s*/.test(body)) {
      archived = true
      body = body.replace(/^\[[xX]\]\s*/, '')
    }
    // Bullet characters are decoration, not structure.
    body = body.replace(/^[-*•>]\s+/, '')

    // Split on the LAST unescaped pipe, so a title may contain an escaped one.
    const pipe = body.search(/(?<!\\)\|/)
    const title = (pipe >= 0 ? body.slice(0, pipe) : body).replace(/\\\|/g, '|').trim()
    const annotations = pipe >= 0 ? body.slice(pipe + 1) : ''

    if (!title) continue

    const node: TextNode = {
      title,
      children: [],
      archived: archived || undefined,
      ...readAnnotations(annotations),
    }

    // A child of the nearest shallower line; a root when there is none.
    if (depth === 0 || stack.length === 0) {
      roots.push(node)
      stack.length = 0
      stack.push(node)
    } else {
      const level = Math.min(depth, stack.length)
      stack[level - 1].children.push(node)
      stack.length = level
      stack.push(node)
    }
    last = node
  }

  return roots
}

/** Every node in the tree, depth first — useful for counting and importing. */
export function flatten(nodes: TextNode[]): TextNode[] {
  return nodes.flatMap(n => [n, ...flatten(n.children)])
}
