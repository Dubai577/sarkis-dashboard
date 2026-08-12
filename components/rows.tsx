'use client'

import Link from 'next/link'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Check } from '@/components/ui/primitives'
import { daysWaiting, type Possession } from '@/lib/possession'
import { mediumLabel, today as todayIso, type IsoDate } from '@/lib/dates'

/**
 * List rows.
 *
 * DENSITY IS THE POINT. These were cards — border, radius, background, 10px of
 * vertical padding — which meant ten late tasks filled a phone screen. A list
 * row is now a hairline-separated line at ~30px, so roughly twice as many fit,
 * and the card treatment is reserved for things that genuinely are cards.
 *
 * The five slots and their order are unchanged, because that is what makes a
 * commitment recognisable across Today, a project, the calendar and a person:
 * category rail, check, title, meta, possession glyph.
 *
 * Titles clamp to one line. Median title is 15 characters and the longest is
 * 473; a row must survive both without changing height.
 */

/** Shared row frame: hairline separator, no chrome, generous tap target. */
const ROW =
  'group flex w-full items-center gap-2 border-b border-line/60 py-1.5 text-left ' +
  'last:border-b-0 hover:bg-surface-2/40'

export interface RowItem {
  id: string
  title: string
  possession?: Possession
  category?: { color: string; name: string } | null
  child_count?: number
  open_child_count?: number
  blocked_child_count?: number
  planned_date?: string | null
  due_date?: string | null
  my_due_date?: string | null
  waiting_person?: { id: string; name: string } | null
  waiting_since?: string | null
  nudge_after?: number | null
}

export function ItemRow({
  item, href, onClick,
}: {
  item: RowItem
  href?: string
  onClick?: () => void
}) {
  const waited = item.waiting_person
    ? daysWaiting(
        {
          waiting_on: item.waiting_person.id,
          waiting_since: item.waiting_since ?? null,
          nudge_after: item.nudge_after ?? null,
        },
        todayIso(),
      )
    : null

  const meta: string[] = []
  if (item.child_count) meta.push(`${item.open_child_count ?? item.child_count}`)
  if (item.waiting_person) {
    meta.push(waited === null ? item.waiting_person.name : `${item.waiting_person.name} ${waited}d`)
  }
  if (item.due_date) meta.push(mediumLabel(item.due_date))
  else if (item.planned_date) meta.push(mediumLabel(item.planned_date))

  const inner = (
    <>
      <span
        className="h-4 w-[2px] shrink-0 rounded-full"
        style={{ background: item.category?.color ?? 'transparent' }}
        aria-hidden="true"
      />
      <span className="clamp-1 min-w-0 flex-1 text-[13px] leading-tight text-ink">{item.title}</span>
      {meta.length > 0 && (
        <span
          className={`shrink-0 text-[10px] tnum ${
            item.possession === 'dropped' ? 'text-dropped' : 'text-ink-3'
          }`}
        >
          {meta.join(' · ')}
        </span>
      )}
      {item.possession && <PossessionGlyph state={item.possession} size={11} />}
    </>
  )

  if (href) return <Link href={href} className={ROW}>{inner}</Link>
  if (onClick) return <button onClick={onClick} className={ROW}>{inner}</button>
  return <div className={ROW}>{inner}</div>
}

/* ── todos ──────────────────────────────────────────────────────── */

export interface RowTodo {
  id: string
  title: string
  is_complete: boolean
  task_date: IsoDate
  start_time?: string | null
  end_time?: string | null
  category?: string | null
  roll_count?: number
  origin_date?: string | null
  source_item_id?: string | null
  source_sweat_id?: string | null
}

export function TodoRow({
  todo, onToggle, onOpen, showDate, accent,
}: {
  todo: RowTodo
  onToggle: () => void
  onOpen?: () => void
  showDate?: boolean
  /** Category colour, when the caller knows it. */
  accent?: string | null
}) {
  const meta: string[] = []
  if (showDate) meta.push(mediumLabel(todo.task_date))
  if (todo.start_time) meta.push(todo.start_time.slice(0, 5))

  // Provenance is rendered from origin_date, never read out of the title, so
  // "(from 5/12)" cannot stack the way the Apps Script tags did.
  if (todo.roll_count && todo.origin_date && todo.origin_date !== todo.task_date) {
    meta.push(`↻${todo.roll_count}`)
  }
  if (todo.source_sweat_id) meta.push('school')

  return (
    <div className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
      <span
        className="h-4 w-[2px] shrink-0 rounded-full"
        style={{ background: accent ?? 'transparent' }}
        aria-hidden="true"
      />
      <Check checked={todo.is_complete} onChange={onToggle} label={`Complete ${todo.title}`} />
      <button
        onClick={onOpen}
        disabled={!onOpen}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className={`clamp-1 block text-[13px] leading-tight ${
          todo.is_complete ? 'text-ink-3 line-through' : 'text-ink'
        }`}>
          {todo.title}
        </span>
      </button>
      {meta.length > 0 && (
        <span className="shrink-0 text-[10px] tnum text-ink-3">{meta.join(' · ')}</span>
      )}
    </div>
  )
}

/**
 * The two-date gap, drawn inline.
 *
 * The information is not the two dates, it is the distance between them and how
 * much has been spent. Used anywhere an item carries both a planned date and a
 * hard deadline — which after the school migration is any item, not just
 * coursework.
 */
export function SlackBar({
  planned, deadline, today = todayIso(), compact,
}: {
  planned: string | null
  deadline: string | null
  today?: IsoDate
  compact?: boolean
}) {
  if (!planned || !deadline || planned > deadline) return null

  const day = 86_400_000
  const at = (d: string) => Date.parse(`${d}T12:00:00Z`)
  const total = Math.max(1, (at(deadline) - at(today)) / day)
  const mine = Math.max(0, (at(planned) - at(today)) / day)
  const pct = Math.min(100, Math.max(0, (mine / total) * 100))

  const pastPlanned = today > planned
  const pastDeadline = today > deadline
  const slack = Math.round((at(deadline) - at(planned)) / day)

  return (
    <div className={compact ? '' : 'mt-1'}>
      <div className="relative h-[3px] overflow-hidden rounded-full bg-surface-3">
        <span
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: pastDeadline ? 'var(--dropped)' : pastPlanned ? 'var(--mine)' : 'var(--done)',
          }}
        />
        <span className="absolute inset-y-0 w-[2px] bg-mine" style={{ left: `${pct}%` }} />
      </div>
      {!compact && (
        <div className="mt-0.5 flex justify-between text-[9px] tnum text-ink-3">
          <span>mine {planned.slice(5)}</span>
          <span className={pastDeadline ? 'text-dropped' : ''}>{slack}d room</span>
          <span>due {deadline.slice(5)}</span>
        </div>
      )}
    </div>
  )
}
