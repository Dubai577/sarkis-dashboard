'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { PossessionGlyph } from '@/components/ui/Possession'
import { AddChild } from '@/components/InlineActions'
import { ItemActions, ActionChip, type ActionTarget } from '@/components/ItemActions'
import { MoveSheet } from '@/components/MoveSheet'
import { Button } from '@/components/ui/primitives'
import { mediumLabel, today as todayIso } from '@/lib/dates'

/**
 * Drill-down through the tree: Convent → department → tasks.
 *
 * The tree already supported any depth; nothing displayed it. This is the
 * "click Convent and its departments appear, each with its tasks in order"
 * shape — a column per level, so where you are stays visible instead of being
 * replaced by where you went.
 *
 * On a phone the columns stack, most recent level last, so the thing just
 * tapped is what you are looking at. On a wide screen they sit side by side
 * and the whole path is on screen at once.
 */

export interface TreeNode {
  id: string
  parent_id: string | null
  title: string
  possession: 'mine' | 'theirs' | 'dropped'
  planned_date: string | null
  due_date: string | null
  priority: string | null
  status: string | null
  link: string | null
  heat: number
  color: string | null
  waiting: string | null
  childCount: number
  /**
   * A container: marked as one, or holding something. Empty ones must still
   * open — a department created with nothing in it is exactly the thing you
   * need to walk into and fill.
   */
  isGroup?: boolean
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, Soon: 1, Whenever: 2, 'N/A': 3 }

/**
 * Ordering within a level: what is late, then what is soon, then what someone
 * is sitting on, then everything else. Stored priority breaks ties but never
 * leads, because 42 of 82 rows say "Soon" and sorting by it mostly sorts noise.
 */
export function urgencyRank(n: TreeNode, now: string): number {
  const date = n.due_date ?? n.planned_date
  let score = 0
  if (n.possession === 'dropped') score -= 1000
  if (date) {
    const days = Math.round(
      (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${now}T12:00:00Z`)) / 86400000,
    )
    score += days < 0 ? -800 + days : days
  } else {
    score += n.status === 'Ongoing' ? 5000 : 2000
  }
  score += (PRIORITY_RANK[n.priority ?? 'N/A'] ?? 3) * 2
  score -= n.heat / 100
  return score
}

/**
 * Container or leaf. `isGroup` is the recorded intent; the child count is the
 * fallback for rows created before migration 015, and for anything that became
 * a container by being filled rather than by being declared one.
 */
export const isGroup = (n: TreeNode): boolean => n.isGroup === true || n.childCount > 0

export function Drill({
  tree,
  rootId,
  onClose,
  onChanged,
}: {
  tree: TreeNode[]
  rootId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [path, setPath] = useState<string[]>([rootId])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const now = todayIso()

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  async function rename(id: string) {
    const title = draftName.trim()
    setRenaming(null)
    if (!title) return
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    onChanged()
  }

  const byId = useMemo(() => new Map(tree.map(n => [n.id, n])), [tree])
  const childrenOf = useMemo(() => {
    const m = new Map<string, TreeNode[]>()
    for (const n of tree) {
      if (!n.parent_id) continue
      const list = m.get(n.parent_id) ?? []
      list.push(n)
      m.set(n.parent_id, list)
    }
    for (const [, list] of m) list.sort((a, b) => urgencyRank(a, now) - urgencyRank(b, now))
    return m
  }, [tree, now])

  // Every level from the root to wherever you have drilled.
  const levels = path.map(id => ({ parent: byId.get(id)!, rows: childrenOf.get(id) ?? [] }))
    .filter(l => l.parent)

  const open = (level: number, id: string) => {
    setPath(p => [...p.slice(0, level + 1), id])
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button onClick={onClose} className="text-[13px] text-ink-2" aria-label="Close">←</button>
        <div className="no-bar flex flex-1 items-center gap-1 overflow-x-auto text-[11px]">
          {levels.map((l, i) => (
            <span key={l.parent.id} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span className="text-ink-3">/</span>}
              <button
                onClick={() => setPath(p => p.slice(0, i + 1))}
                className={i === levels.length - 1 ? 'text-ink' : 'text-ink-3'}
              >
                {l.parent.title}
              </button>
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto md:flex md:gap-3 md:overflow-x-auto md:p-3">
        {levels.map((level, i) => (
          <section
            key={level.parent.id}
            className={`border-b border-line px-3 py-2 md:w-[300px] md:shrink-0 md:rounded-md md:border ${
              i < levels.length - 1 ? 'hidden md:block' : ''
            }`}
          >
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="h-3 w-[3px] rounded-full"
                    style={{ background: level.parent.color ?? 'var(--border-2)' }} />
              {renaming === level.parent.id ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onBlur={() => rename(level.parent.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') rename(level.parent.id)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="min-w-0 flex-1 rounded-sm border border-mine/60 bg-surface-2 px-1 py-px text-[12px]"
                />
              ) : (
                <button
                  onDoubleClick={() => { setRenaming(level.parent.id); setDraftName(level.parent.title) }}
                  onClick={() => { setRenaming(level.parent.id); setDraftName(level.parent.title) }}
                  className="text-[12px] font-medium"
                  title="Tap to rename"
                >
                  {level.parent.title}
                </button>
              )}
              <span className="text-[10px] tnum text-ink-3">{level.rows.length}</span>
              {level.parent.link && (
                <a href={level.parent.link} target="_blank" rel="noopener noreferrer"
                   className="text-[10px] text-mine">↗</a>
              )}
            </div>

            {level.rows.length === 0 ? (
              <p className="py-1 text-[11px] text-ink-3">Nothing under this yet.</p>
            ) : (
              level.rows.map(n => {
                const date = n.due_date ?? n.planned_date
                const late = !!date && date < now
                const isOpen = path[i + 1] === n.id
                return (
                  <div key={n.id}
                       className={`flex items-center gap-1.5 border-b border-line/60 py-1 last:border-b-0 ${
                         isOpen ? 'bg-surface-2' : ''
                       } ${selected.has(n.id) ? 'bg-mine-soft' : ''}`}>
                    <button
                      onClick={() => toggle(n.id)}
                      aria-label={`Select ${n.title}`}
                      className={`grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[4px] border ${
                        selected.has(n.id) ? 'border-mine bg-mine' : 'border-ink-3'
                      }`}
                    >
                      {selected.has(n.id) && (
                        <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="var(--bg)"
                                strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    {isGroup(n) ? (
                      <button onClick={() => open(i, n.id)}
                              className="clamp-1 min-w-0 flex-1 text-left text-[12px] font-medium">
                        {n.title}
                        <span className="ml-1 text-[9px] tnum text-ink-3">{n.childCount}</span>
                      </button>
                    ) : (
                      <Link href={`/items/${n.id}`} className="clamp-1 min-w-0 flex-1 text-[12px]">
                        {n.title}
                      </Link>
                    )}

                    {n.waiting && (
                      <span className={`shrink-0 text-[9.5px] ${
                        n.possession === 'dropped' ? 'text-dropped' : 'text-ink-3'
                      }`}>
                        {n.waiting.split(' ')[0]}
                      </span>
                    )}

                    <ActionChip
                      item={{ id: n.id, title: n.title, parent_id: n.parent_id,
                              planned_date: n.planned_date, due_date: n.due_date, status: n.status }}
                      onOpen={() => setActionTarget({
                        id: n.id, title: n.title, parent_id: n.parent_id,
                        planned_date: n.planned_date, due_date: n.due_date, status: n.status,
                      })}
                    />

                    {n.possession !== 'mine' && <PossessionGlyph state={n.possession} size={9} />}
                    {isGroup(n) && <span className="shrink-0 text-[10px] text-ink-3">›</span>}
                  </div>
                )
              })
            )}

            <AddChild parentId={level.parent.id} onAdded={onChanged} />
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
          <span className="text-[12px] tnum text-ink-2">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-[11px] text-ink-3">clear</button>
          <Button variant="primary" className="ml-auto" onClick={() => setMoveOpen(true)}>
            Move to…
          </Button>
        </div>
      )}

      <ItemActions
        item={actionTarget}
        tree={tree}
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onDone={onChanged}
      />

      <MoveSheet
        open={moveOpen}
        ids={[...selected]}
        tree={tree}
        suggestedParent={levels[levels.length - 1]?.parent ?? null}
        onClose={() => setMoveOpen(false)}
        onMoved={() => { setSelected(new Set()); onChanged() }}
      />
    </div>
  )
}
