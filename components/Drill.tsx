'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { PossessionGlyph } from '@/components/ui/Possession'
import { AddChild, QuickDate } from '@/components/InlineActions'
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
  const now = todayIso()

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
              <Link href={`/items/${level.parent.id}`} className="text-[12px] font-medium">
                {level.parent.title}
              </Link>
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
                       }`}>
                    {n.childCount > 0 ? (
                      <button onClick={() => open(i, n.id)}
                              className="clamp-1 min-w-0 flex-1 text-left text-[12px]">
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

                    {date ? (
                      <span className={`shrink-0 text-[9.5px] tnum ${late ? 'text-dropped' : 'text-ink-2'}`}>
                        {mediumLabel(date)}
                      </span>
                    ) : n.status === 'Ongoing' ? (
                      <span className="shrink-0 text-[9.5px] text-theirs">ongoing</span>
                    ) : (
                      <QuickDate
                        item={{ id: n.id, planned_date: n.planned_date, status: n.status }}
                        onDone={onChanged}
                      />
                    )}

                    {n.possession !== 'mine' && <PossessionGlyph state={n.possession} size={9} />}
                    {n.childCount > 0 && <span className="shrink-0 text-[10px] text-ink-3">›</span>}
                  </div>
                )
              })
            )}

            <AddChild parentId={level.parent.id} onAdded={onChanged} />
          </section>
        ))}
      </div>
    </div>
  )
}
