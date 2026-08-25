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

export interface ActionTarget {
  id: string
  title: string
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
      onDone()
      if (close) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  const ongoing = item.status === 'Ongoing'
  const isProject = !item.parent_id

  return (
    <Sheet open={open} onClose={onClose} title={item.title}>
      {error && <p className="mb-2 text-[12px] text-dropped">{error}</p>}

      <div className="space-y-4">
        {/* ── what is it ── */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            What is it
          </span>
          <div className="flex gap-1.5">
            <Button
              variant={isProject ? 'primary' : 'quiet'}
              disabled={busy}
              onClick={() => patch({ parent_id: null, board: 'pinned' })}
              className="flex-1"
            >
              A project
            </Button>
            <Button
              variant={!isProject ? 'primary' : 'quiet'}
              disabled={busy}
              onClick={() => {
                document.getElementById('move-under')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="flex-1"
            >
              A task under…
            </Button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-ink-3">
            {isProject
              ? 'Top level, and pinned to the board. It becomes a project with departments as soon as you put something under it.'
              : `Currently under ${byId.get(item.parent_id ?? '')?.title ?? 'something'}.`}
          </p>
        </section>

        {/* ── the two dates, which are two different facts ── */}
        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Planned — when you mean to do it
          </span>
          <div className="mb-1.5 flex gap-1.5">
            {([['Today', todayIso()], ['Tomorrow', addDays(todayIso(), 1)], ['+1 week', addDays(todayIso(), 7)]] as const).map(
              ([label, date]) => (
                <button key={label} disabled={busy}
                        onClick={() => patch({ planned_date: date, status: null })}
                        className="flex-1 rounded-md border border-line py-1.5 text-[11px] text-ink-2">
                  {label}
                </button>
              ),
            )}
          </div>
          <input
            type="date"
            disabled={busy}
            value={item.planned_date ?? ''}
            onChange={e => patch({ planned_date: e.target.value || null, status: null })}
            className={inputClass}
          />
        </section>

        <section>
          <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">
            Due — the real deadline
          </span>
          <input
            type="date"
            disabled={busy}
            value={item.due_date ?? ''}
            onChange={e => patch({ due_date: e.target.value || null })}
            className={inputClass}
          />
          {item.planned_date && item.due_date && (
            <p className="mt-1 text-[10px] text-ink-3">
              {Math.round(
                (Date.parse(`${item.due_date}T12:00:00Z`) - Date.parse(`${item.planned_date}T12:00:00Z`)) / 86400000,
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
            Move under
          </span>
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
                {item.parent_id === node.id && (
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

/** The compact trigger that sits on a row. Shows the state at a glance. */
export function ActionChip({
  item,
  onOpen,
}: {
  item: ActionTarget
  onOpen: () => void
}) {
  const label = item.planned_date
    ? mediumLabel(item.planned_date)
    : item.due_date
      ? `due ${mediumLabel(item.due_date)}`
      : item.status === 'Ongoing'
        ? 'ongoing'
        : 'set'

  const tone = item.due_date && !item.planned_date
    ? 'text-dropped border-dropped/40'
    : item.status === 'Ongoing'
      ? 'text-theirs border-theirs/40'
      : item.planned_date
        ? 'text-ink-2 border-line'
        : 'text-ink-3 border-line'

  return (
    <button
      onClick={e => { e.preventDefault(); e.stopPropagation(); onOpen() }}
      className={`shrink-0 rounded-sm border px-1.5 py-px text-[9.5px] tnum ${tone}`}
    >
      {label}
    </button>
  )
}
