'use client'

import { useMemo, useState } from 'react'
import { Sheet, Button, Field, inputClass } from '@/components/ui/primitives'
import { addDays, mediumLabel, today as todayIso } from '@/lib/dates'
import type { TreeNode } from '@/components/Drill'

/**
 * Everything you can decide about one item, in one sheet.
 *
 * The inline control only offered a planned date, which collapsed three
 * separate decisions into one button:
 *
 *   what IS it     a project in its own right, or a task under one
 *   when do I mean to do it   planned_date
 *   when is it actually due   due_date  — a different fact, often a different day
 *
 * The gap between the two dates is the useful part — it is the slack you have —
 * so they are two fields, never one.
 */

export type Progress = 'in_progress' | 'done' | null

export interface ActionTarget {
  id: string
  title: string
  progress?: Progress
  parent_id?: string | null
  planned_date: string | null
  due_date: string | null
  status: string | null
  board?: 'auto' | 'pinned' | 'muted'
}

export function ItemActions({
  item,
  tree,
  open,
  onClose,
  onDone,
}: {
  item: ActionTarget | null
  tree: TreeNode[]
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [titleFor, setTitleFor] = useState<string | null>(null)

  // Reset the draft when the sheet opens on a different item, without an
  // effect: keying off the id means no stale title can be saved onto the wrong
  // row if the sheet is reopened quickly.
  if (item && titleFor !== item.id) {
    setTitleFor(item.id)
    setTitle(item.title)
  }

  const byId = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree])

  const pathOf = (n: TreeNode): string => {
    const parts = [n.title]
    let cursor = n.parent_id
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor)
      const p = byId.get(cursor)
      if (!p) break
      parts.unshift(p.title)
      cursor = p.parent_id
    }
    return parts.join(' / ')
  }

  const targets = useMemo(() => {
    if (!item) return []
    const q = query.trim().toLowerCase()
    return tree
      .filter(n => n.id !== item.id)
      .map(n => ({ node: n, path: pathOf(n) }))
      .filter(t => !q || t.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 40)
  }, [tree, query, item])

  if (!item) return null

  /**
   * Render from the LIVE node, not the snapshot handed in when the sheet
   * opened. The parent stores the target in state, so after a save its copy is
   * stale and every field here would keep showing the old value until the sheet
   * was closed and reopened — including the rename button, which would never
   * stop offering a rename it had already done.
   */
  const live = tree.find(n => n.id === item.id)
  const current: ActionTarget = live
    ? {
        id: live.id,
        title: live.title,
        parent_id: live.parent_id,
        planned_date: live.planned_date,
        due_date: live.due_date,
        status: live.status,
        progress: live.progress ?? null,
      }
    : item

  async function patch(body: Record<string, unknown>, close = false) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/items/${item!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'That did not save.')
      if (typeof body.title === 'string') setTitle(body.title)
      onDone()
      if (close) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  const ongoing = current.status === 'Ongoing'
  const isProject = !current.parent_id
  // Recorded intent first, then the fallback: something holding children is a
  // container whether or not anyone ever said so.
  const holds = live ? live.isGroup === true || live.childCount > 0 : false
  const canUnmark = live ? live.childCount === 0 : false
  const shape: 'project' | 'sub' | 'task' = isProject ? 'project' : holds ? 'sub' : 'task'

  return (
    <Sheet open={open} onClose={onClose} title={current.title}>
      {error && <p className="mb-2 text-[12px] text-dropped">{error}</p>}

      <div className="space-y-4">
        {/* ── the name ── */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Name
          </span>
          <div className="flex gap-1.5">
            <textarea
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (title.trim() && title.trim() !== current.title) patch({ title: title.trim() })
                }
              }}
              rows={2}
              className={`${inputClass} resize-none text-[13px] leading-snug`}
            />
          </div>
          {title.trim() && title.trim() !== current.title && (
            <Button
              variant="primary"
              full
              disabled={busy}
              className="mt-1.5"
              onClick={() => patch({ title: title.trim() })}
            >
              Rename
            </Button>
          )}
        </section>

        {/*
          ── what is it ──

          Two facts decide the shape of a thing: whether it holds others, and
          what it sits under. Asking for them separately meant reasoning about
          the model instead of the work, so the three shapes are named outright
          and each one sets both fields.
        */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            What is it
          </span>
          <div className="flex gap-1">
            {([
              ['project', 'Its own project'],
              ['sub', 'A sub-project'],
              ['task', 'A task'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                disabled={busy || (value === 'task' && holds && !canUnmark)}
                onClick={() => {
                  if (value === 'project') return patch({ parent_id: null, is_group: true, board: 'pinned' })
                  patch({ is_group: value === 'sub' })
                  document.getElementById('move-under')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className={`flex-1 rounded-md border py-1.5 text-[11.5px] ${
                  shape === value ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
                } ${value === 'task' && holds && !canUnmark ? 'opacity-50' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-snug text-ink-3">
            {holds && !canUnmark && shape !== 'project'
              ? `It holds ${live?.childCount}, so it cannot be a plain task — move those out first.`
              : shape === 'project'
                ? 'Top level and pinned. Put departments or tasks under it.'
                : shape === 'sub'
                  ? `A department under ${byId.get(current.parent_id ?? '')?.title ?? '— pick one below'}. It can hold its own tasks.`
                  : `Under ${byId.get(current.parent_id ?? '')?.title ?? '— pick one below'}. Pick a department below and it is a task under a sub-project.`}
          </p>
        </section>

        {/*
          ── how far along ──

          Done is not archived. Done means you finished it and want to see
          that you did; archived means put it away. A finished task stays on
          the board struck through until you archive it — the same reason a
          ticked todo now stays on Today rather than vanishing.
        */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Progress
          </span>
          <div className="flex gap-1">
            {([
              [null, 'Not started'],
              ['in_progress', 'In progress'],
              ['done', 'Done'],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                disabled={busy}
                onClick={() => patch({ progress: value })}
                className={`flex-1 rounded-md border py-1.5 text-[11px] ${
                  (current.progress ?? null) === value
                    ? value === 'done'
                      ? 'border-done bg-done-soft text-done'
                      : 'border-mine bg-mine-soft text-mine'
                    : 'border-line text-ink-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ── the two dates, which are two different facts ── */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Planned — when you mean to do it
          </span>
          {/*
            Two shortcuts, then a real date.

            "+1 week" was the third shortcut and nobody means "a week from
            today" — they mean a day they have in mind. It is gone, and the
            date field is labelled instead of sitting unexplained under the
            buttons, where it read as part of them rather than the way to pick
            any other day.
          */}
          <div className="mb-1.5 flex gap-1.5">
            {([['Today', todayIso()], ['Tomorrow', addDays(todayIso(), 1)]] as const).map(
              ([label, date]) => (
                <button key={label} disabled={busy}
                        onClick={() => patch({ planned_date: date, status: null })}
                        className={`flex-1 rounded-md border py-1.5 text-[11px] ${
                          current.planned_date === date
                            ? 'border-mine bg-mine-soft text-mine'
                            : 'border-line text-ink-2'
                        }`}>
                  {label}
                </button>
              ),
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] text-ink-3">Or any other day</span>
            <input
              type="date"
              disabled={busy}
              value={current.planned_date ?? ''}
              onChange={e => patch({ planned_date: e.target.value || null, status: null })}
              className={inputClass}
            />
          </label>
          {current.planned_date && (
            <button
              disabled={busy}
              onClick={() => patch({ planned_date: null })}
              className="mt-1 text-[10px] text-ink-3 underline underline-offset-2"
            >
              clear the planned date
            </button>
          )}
        </section>

        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Due — the real deadline
          </span>
          <input
            type="date"
            disabled={busy}
            value={current.due_date ?? ''}
            onChange={e => patch({ due_date: e.target.value || null })}
            className={inputClass}
          />
          {current.due_date && (
            <button
              disabled={busy}
              onClick={() => patch({ due_date: null })}
              className="mt-1 text-[10px] text-ink-3 underline underline-offset-2"
            >
              clear the due date
            </button>
          )}
          {current.planned_date && current.due_date && (
            <p className="mt-1 text-[10px] text-ink-3">
              {Math.round(
                (Date.parse(`${current.due_date}T12:00:00Z`) - Date.parse(`${current.planned_date}T12:00:00Z`)) / 86400000,
              )} days of slack between them.
            </p>
          )}
        </section>

        <section>
          <button
            disabled={busy}
            onClick={() => patch({ status: ongoing ? null : 'Ongoing', planned_date: null, due_date: null })}
            className={`w-full rounded-md border py-2 text-[12px] ${
              ongoing ? 'border-theirs bg-theirs-soft text-theirs' : 'border-line text-ink-2'
            }`}
          >
            {ongoing ? 'Ongoing — tap to clear' : 'No date needed — it is ongoing'}
          </button>
          <p className="mt-1 text-[10px] leading-snug text-ink-3">
            Keeps it out of the &ldquo;needs a date&rdquo; pile without pretending it is scheduled.
          </p>
        </section>

        {/* ── move it under something ── */}
        <section id="move-under">
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Under
          </span>
          <p className="mb-1.5 text-[10px] leading-snug text-ink-3">
            A project puts it one level down. A department puts it two.
          </p>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search projects and departments…"
            className={`${inputClass} mb-1.5`}
          />
          <div className="max-h-48 overflow-y-auto rounded-md border border-line">
            {targets.map(({ node, path }) => (
              <button
                key={node.id}
                disabled={busy}
                onClick={() => patch({ parent_id: node.id }, true)}
                className="flex w-full items-center gap-2 border-b border-line/60 px-2 py-1.5 text-left last:border-b-0"
              >
                <span className="h-3 w-[2px] shrink-0 rounded-full"
                      style={{ background: node.color ?? 'var(--border-2)' }} />
                <span className="clamp-1 flex-1 text-[12px]">{path}</span>
                {current.parent_id === node.id && (
                  <span className="shrink-0 text-[10px] text-mine">current</span>
                )}
              </button>
            ))}
            {targets.length === 0 && (
              <p className="px-2 py-2 text-[11px] text-ink-3">Nothing matches.</p>
            )}
          </div>
        </section>

        <div className="flex gap-1.5 pt-1">
          <Button variant="quiet" full onClick={onClose}>Done</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => { await fetch(`/api/items/${item.id}`, { method: 'DELETE' }); onDone(); onClose() }}
          >
            Archive
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * The compact trigger that sits on a row.
 *
 * It used to print a date, which is the least useful form of the answer: nobody
 * reads "Sep 9" and knows whether that is a problem. A countdown says the thing
 * you actually want — how long you have — and a dot carries the same fact in
 * colour so a wall of chips is scannable without reading any of them.
 *
 * The countdown runs to the PLANNED date when there is one, because that is the
 * day you decided to do the work, and the deadline is already accounted for by
 * having chosen it. It falls back to the due date when nothing is planned.
 */
export function daysUntil(date: string, now: string): number {
  return Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${now}T12:00:00Z`)) / 86400000,
  )
}

export function countdownLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)} days late`
  return `${days} days`
}

export function ActionChip({
  item,
  onOpen,
}: {
  item: ActionTarget
  onOpen: () => void
}) {
  const now = todayIso()
  const target = item.planned_date ?? item.due_date
  const days = target ? daysUntil(target, now) : null

  const label = days === null
    ? (item.status === 'Ongoing' ? 'ongoing' : 'set')
    : countdownLabel(days)

  /**
   * Colour by how much room is left, not by which field it came from. Late is
   * late whether it was planned or due.
   */
  const tone =
    days === null
      ? item.status === 'Ongoing'
        ? { dot: 'var(--theirs)', text: 'text-theirs border-theirs/40' }
        : { dot: 'var(--border-2)', text: 'text-ink-3 border-line' }
      : days < 0
        ? { dot: 'var(--dropped)', text: 'text-dropped border-dropped/40' }
        : days <= 1
          ? { dot: 'var(--dropped)', text: 'text-dropped border-dropped/30' }
          : days <= 3
            ? { dot: 'var(--mine)', text: 'text-mine border-mine/30' }
            : days <= 7
              ? { dot: 'var(--theirs)', text: 'text-theirs border-theirs/30' }
              : { dot: 'var(--border-2)', text: 'text-ink-3 border-line' }

  // The dates themselves are still one hover away, for when the countdown is
  // not enough.
  const title = [
    item.planned_date ? `planned ${mediumLabel(item.planned_date)}` : null,
    item.due_date ? `due ${mediumLabel(item.due_date)}` : null,
  ].filter(Boolean).join(' · ') || 'No date set'

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onOpen() }}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[9.5px] tnum ${tone.text}`}
    >
      <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: tone.dot }} />
      {label}
    </button>
  )
}
