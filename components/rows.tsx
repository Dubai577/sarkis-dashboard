'use client'

import Link from 'next/link'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Check, CategoryRail } from '@/components/ui/primitives'
import { daysWaiting, type Possession } from '@/lib/possession'
import { mediumLabel, today as todayIso, type IsoDate } from '@/lib/dates'

/**
 * The row is the atom of every list. Same five slots in the same order on every
 * surface — category rail, check, title, meta, possession glyph — so a
 * commitment is recognisable whether it appears in Today, a project, the
 * calendar or a person's page, without anything having to say they are the
 * same record.
 *
 * The title is always clamped to one line. Median title here is 15 characters
 * and the longest is 473; a row has to survive both without changing height.
 */

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
  waiting_person?: { id: string; name: string } | null
  waiting_since?: string | null
  nudge_after?: number | null
}

export function ItemRow({
  item,
  href,
  onClick,
  dense,
}: {
  item: RowItem
  href?: string
  onClick?: () => void
  dense?: boolean
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
  if (item.child_count) meta.push(`${item.open_child_count ?? item.child_count} open`)
  if (item.waiting_person) {
    meta.push(waited === null ? item.waiting_person.name : `${item.waiting_person.name} · ${waited}d`)
  }
  if (item.due_date) meta.push(`due ${mediumLabel(item.due_date)}`)
  else if (item.planned_date) meta.push(mediumLabel(item.planned_date))
  if (item.blocked_child_count) meta.push(`${item.blocked_child_count} stalled`)

  const body = (
    <div
      className={`flex items-start gap-2.5 rounded-md border border-line bg-surface px-2.5 ${
        dense ? 'py-2' : 'py-2.5'
      } transition-colors hover:border-line-2`}
    >
      <CategoryRail color={item.category?.color} />

      <div className="min-w-0 flex-1">
        <div className="clamp-1 text-sm text-ink">{item.title}</div>
        {meta.length > 0 && (
          <div
            className={`mt-0.5 text-[11px] tnum ${
              item.possession === 'dropped' ? 'text-dropped' : 'text-ink-3'
            }`}
          >
            {meta.join(' · ')}
          </div>
        )}
      </div>

      {item.possession && (
        <PossessionGlyph state={item.possession} size={13} className="mt-1" />
      )}
    </div>
  )

  if (href) return <Link href={href} className="block">{body}</Link>
  if (onClick) return <button onClick={onClick} className="block w-full text-left">{body}</button>
  return body
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
  todo,
  onToggle,
  onOpen,
  showDate,
}: {
  todo: RowTodo
  onToggle: () => void
  onOpen?: () => void
  showDate?: boolean
}) {
  const meta: string[] = []

  if (showDate) meta.push(mediumLabel(todo.task_date))
  if (todo.start_time) meta.push(todo.start_time + (todo.end_time ? `–${todo.end_time}` : ''))

  /**
   * Provenance is rendered from origin_date, never read out of the title. The
   * Apps Script version appended "(from 5/12)" to the text, which stacked into
   * "(from 5/12) (from 5/13) (from 5/14)". Storing the date makes that
   * structurally impossible.
   */
  if (todo.roll_count && todo.origin_date && todo.origin_date !== todo.task_date) {
    meta.push(`from ${mediumLabel(todo.origin_date)}`)
  }
  if (todo.source_item_id) meta.push('backlog')
  if (todo.source_sweat_id) meta.push('coursework')
  if (todo.category) meta.push(todo.category)

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2.5">
      <Check checked={todo.is_complete} onChange={onToggle} label={`Complete ${todo.title}`} />

      <button
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
        disabled={!onOpen}
      >
        <div className={`clamp-1 text-sm ${todo.is_complete ? 'text-ink-3 line-through' : 'text-ink'}`}>
          {todo.title}
        </div>
        {meta.length > 0 && (
          <div className="mt-0.5 text-[11px] tnum text-ink-3">{meta.join(' · ')}</div>
        )}
      </button>

      {(todo.roll_count ?? 0) >= 3 && !todo.is_complete && (
        <span
          className="mt-0.5 rounded-sm border border-dropped/40 px-1 text-[10px] tnum text-dropped"
          title={`Rolled forward ${todo.roll_count} times`}
        >
          ×{todo.roll_count}
        </span>
      )}
    </div>
  )
}
