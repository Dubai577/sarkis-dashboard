'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { TodoRow, SlackBar, type RowTodo } from '@/components/rows'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Panel } from '@/components/ui/Panel'
import { ErrorBanner, Spinner } from '@/components/ui/primitives'
import { AddChild, PromoteNote, WaitingOnSheet } from '@/components/InlineActions'
import { mediumLabel, shortLabel } from '@/lib/dates'

/**
 * The hub.
 *
 * Not a menu of links — the things themselves, actionable in place. The only
 * surface deliberately not folded in is the calendar: time needs a full screen
 * and does not compress into a panel, so it has its own tab.
 *
 * Everything is a collapsible Panel that remembers its state, so the hub can
 * hold far more than fits a screen and still open where you left it. An empty
 * section collapses to one quiet line rather than a card announcing emptiness —
 * at 375px, five "nothing here" cards is the whole screen.
 *
 * Panel selection and order are provisional until the sorted export comes back;
 * each is a self-contained block, so rearranging is moving lines, not a rewrite.
 */

interface Dropped {
  id: string; title: string
  category: { name: string; color: string } | null
  waiting_person: { id: string; name: string } | null
  waiting_since: string | null; nudge_after: number
  possession: 'dropped'; waiting_on: string | null
}

interface Project {
  id: string; title: string; color: string | null
  open: number; total: number; dropped: number
  possession: 'mine' | 'theirs' | 'dropped'
  isSchool: boolean; category_id: string | null
  waiting_person: { id: string; name: string } | null
  children: { id: string; title: string; possession: 'mine' | 'theirs' | 'dropped' }[]
}

interface Payload {
  date: string
  todos: RowTodo[]
  overdueCount: number
  droppedCount: number
  week: { date: string; total: number; done: number; isToday: boolean }[]
  projects: Project[]
  dropped: Dropped[]
  waiting: { id: string; name: string; items: { id: string; title: string; days: number | null; dropped: boolean }[] }[]
  school: { id: string; title: string; planned_date: string | null; due_date: string | null }[]
  notes: { id: string; content: string; created_at: string }[]
  routines: { total: number; done: number }
  categories: { id: string; name: string; color: string }[]
  people: { id: string; name: string }[]
  contributors: {
    people: number
    recentDone: { id: string; who: string; what: string; project: string | null }[]
    outstanding: { project: string; count: number }[]
  }
}

export default function HubPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [waitingTarget, setWaitingTarget] = useState<Dropped | null>(null)
  const [noteTarget, setNoteTarget] = useState<{ id: string; content: string } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load.')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onCapture = () => load()
    window.addEventListener('merc:captured', onCapture)
    return () => window.removeEventListener('merc:captured', onCapture)
  }, [load])

  async function toggleTodo(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    setData({ ...data, todos: data.todos.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t)) })
    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: next }),
      })
      if (!res.ok) throw new Error('That did not save.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
      load()
    }
  }

  if (error && !data) return <div className="p-4"><ErrorBanner message={error} onRetry={load} /></div>
  if (!data) return <Spinner label="Loading" />

  const open = data.todos.filter(t => !t.is_complete)
  const roots = data.projects.map(p => ({ id: p.id, title: p.title }))

  return (
    <div className="mx-auto max-w-3xl px-3 py-3">
      {error && <div className="mb-2"><ErrorBanner message={error} onRetry={load} /></div>}

      {/* Attention: the two states nothing else in the app surfaces. */}
      {(data.droppedCount > 0 || data.overdueCount > 0) && (
        <div className="mb-2 flex gap-1.5">
          {data.droppedCount > 0 && (
            <span className="flex-1 rounded-md border border-dropped/40 bg-dropped-soft px-2 py-1">
              <span className="block text-[9px] uppercase tracking-wide text-dropped">Needs a nudge</span>
              <span className="text-sm tnum text-dropped">{data.droppedCount}</span>
            </span>
          )}
          {data.overdueCount > 0 && (
            <Link href="/today" className="flex-1 rounded-md border border-line px-2 py-1">
              <span className="block text-[9px] uppercase tracking-wide text-ink-3">Late</span>
              <span className="text-sm tnum text-ink-2">{data.overdueCount}</span>
            </Link>
          )}
        </div>
      )}

      <Panel id="today" title="Today" count={open.length}
             hint={`routines ${data.routines.done}/${data.routines.total}`}
             emptyLabel="nothing scheduled"
             action={<Link href="/today" className="text-[10px] text-ink-3">full →</Link>}>
        {open.map(todo => (
          <TodoRow key={todo.id} todo={todo} onToggle={() => toggleTodo(todo)} />
        ))}
      </Panel>

      <Panel id="week" title="This week" count={data.week.reduce((n, d) => n + d.total, 0)}
             emptyLabel="nothing dated this week"
             action={<Link href="/calendar?view=week" className="text-[10px] text-ink-3">calendar →</Link>}>
        <div className="flex gap-1">
          {data.week.map(day => (
            <Link key={day.date} href={`/calendar?view=day&date=${day.date}`}
                  className={`flex-1 rounded-sm border px-1 py-1 text-center ${
                    day.isToday ? 'border-mine' : 'border-line'
                  }`}>
              <span className="block text-[9px] uppercase text-ink-3">{shortLabel(day.date)}</span>
              <span className={`block text-[13px] tnum ${day.total ? 'text-ink' : 'text-ink-3'}`}>
                {day.total || '·'}
              </span>
              <span className="mt-0.5 block h-[2px] rounded-full bg-surface-3">
                <span className="block h-full rounded-full bg-done"
                      style={{ width: `${day.total ? (day.done / day.total) * 100 : 0}%` }} />
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel id="dropped" title="Needs a nudge" count={data.dropped.length} tone="dropped"
             hint="waiting too long" emptyLabel="nobody is overdue to reply">
        {data.dropped.map(item => (
          <div key={item.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
            <span className="h-4 w-[2px] shrink-0 rounded-full"
                  style={{ background: item.category?.color ?? 'var(--border-2)' }} />
            <Link href={`/items/${item.id}`} className="clamp-1 min-w-0 flex-1 text-[13px]">
              {item.title}
            </Link>
            <button onClick={() => setWaitingTarget(item)}
                    className="shrink-0 text-[10px] tnum text-dropped underline underline-offset-2">
              {item.waiting_person?.name ?? 'set'}
            </button>
            <PossessionGlyph state="dropped" size={11} />
          </div>
        ))}
      </Panel>

      <Panel id="waiting" title="Waiting on" count={data.waiting.length}
             emptyLabel="not waiting on anyone"
             action={<Link href="/people" className="text-[10px] text-ink-3">people →</Link>}>
        {data.waiting.map(person => (
          <div key={person.id} className="border-b border-line/60 py-1.5 last:border-b-0">
            <div className="flex items-baseline gap-2">
              <Link href={`/people/${person.id}`} className="text-[13px]">{person.name}</Link>
              <span className="text-[10px] tnum text-ink-3">{person.items.length}</span>
              {person.items.some(i => i.dropped) && (
                <span className="text-[10px] text-dropped">needs a nudge</span>
              )}
            </div>
            {person.items.slice(0, 3).map(i => (
              <Link key={i.id} href={`/items/${i.id}`}
                    className="clamp-1 block pl-2 text-[11px] leading-snug text-ink-3">
                {i.title}{i.days !== null && ` · ${i.days}d`}
              </Link>
            ))}
          </div>
        ))}
      </Panel>

      <Panel id="projects" title="Projects" count={data.projects.length}
             emptyLabel="no projects yet"
             action={<Link href="/projects" className="text-[10px] text-ink-3">full →</Link>}>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
          {data.projects.map(p => (
            <button key={p.id} onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                    className="flex flex-col items-center gap-0.5">
              <Ring open={p.open} total={p.total} color={p.color}
                    dropped={p.dropped > 0} school={p.isSchool} active={expanded === p.id} />
              <span className="clamp-1 w-full text-center text-[9px] leading-tight text-ink-3">
                {p.title}
              </span>
            </button>
          ))}
        </div>

        {/* Tapping a ring opens that project in place rather than navigating. */}
        {expanded && (() => {
          const project = data.projects.find(p => p.id === expanded)
          if (!project) return null
          return (
            <div className="mt-2 rounded-md border border-line p-2">
              <div className="mb-1 flex items-baseline gap-2">
                <Link href={`/items/${project.id}`} className="text-[13px] font-medium">{project.title}</Link>
                <span className="text-[10px] tnum text-ink-3">{project.open} open</span>
                {project.waiting_person && (
                  <span className="text-[10px] text-ink-3">waiting on {project.waiting_person.name}</span>
                )}
              </div>
              {project.children.map(c => (
                <Link key={c.id} href={`/items/${c.id}`}
                      className="flex items-center gap-2 border-b border-line/60 py-1 last:border-b-0">
                  <span className="clamp-1 flex-1 text-[12px] text-ink-2">{c.title}</span>
                  <PossessionGlyph state={c.possession} size={10} />
                </Link>
              ))}
              <AddChild parentId={project.id} categoryId={project.category_id} onAdded={load} />
            </div>
          )
        })()}
      </Panel>

      <Panel id="school" title="School" count={data.school.length}
             hint="deadlines" emptyLabel="no coursework dated"
             action={<Link href="/list?category=School" className="text-[10px] text-ink-3">all →</Link>}>
        {data.school.map(s => (
          <div key={s.id} className="border-b border-line/60 py-1.5 last:border-b-0">
            <Link href={`/items/${s.id}`} className="clamp-1 block text-[13px]">{s.title}</Link>
            {s.planned_date && s.due_date ? (
              <SlackBar planned={s.planned_date} deadline={s.due_date} today={data.date} compact />
            ) : (
              <span className="text-[10px] tnum text-ink-3">
                {s.due_date ? `due ${mediumLabel(s.due_date)}` : `planned ${mediumLabel(s.planned_date!)}`}
              </span>
            )}
          </div>
        ))}
      </Panel>

      <Panel id="service" title="Service" count={data.contributors.recentDone.length}
             hint={`${data.contributors.people} people`}
             emptyLabel="no contributor activity">
        {data.contributors.recentDone.map(a => (
          <div key={a.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-done" />
            <span className="clamp-1 flex-1 text-[12px]">
              <span className="text-ink">{a.who}</span>
              <span className="text-ink-2"> — {a.what}</span>
            </span>
            {a.project && <span className="shrink-0 text-[10px] text-ink-3">{a.project}</span>}
          </div>
        ))}
        {data.contributors.outstanding.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5">
            {data.contributors.outstanding.map(o => (
              <span key={o.project}
                    className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
                {o.project} <span className="tnum text-ink-2">{o.count}</span>
              </span>
            ))}
          </div>
        )}
        <p className="pt-1.5 text-[10px] text-ink-3">Portal paused — read-only until it is rebuilt.</p>
      </Panel>

      <Panel id="notes" title="Notes" count={data.notes.length}
             emptyLabel="inbox empty"
             action={<Link href="/notes" className="text-[10px] text-ink-3">all →</Link>}>
        {data.notes.map(n => (
          <div key={n.id} className="flex items-start gap-2 border-b border-line/60 py-1.5 last:border-b-0">
            <span className="clamp-2 min-w-0 flex-1 text-[12px] leading-snug text-ink-2">{n.content}</span>
            <button onClick={() => setNoteTarget(n)}
                    className="shrink-0 text-[10px] text-mine underline underline-offset-2">
              → item
            </button>
          </div>
        ))}
      </Panel>

      <WaitingOnSheet
        item={waitingTarget}
        people={data.people}
        open={!!waitingTarget}
        onClose={() => setWaitingTarget(null)}
        onDone={load}
      />
      <PromoteNote
        note={noteTarget}
        roots={roots}
        categories={data.categories}
        open={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        onDone={load}
      />
    </div>
  )
}

/**
 * A project at a glance. Ring fill is how much is closed, colour is the
 * category, garnet means something inside has been dropped, and School is a
 * square so coursework is distinguishable without reading the label.
 */
function Ring({
  open, total, color, dropped, school, active,
}: {
  open: number; total: number; color: string | null
  dropped: boolean; school: boolean; active: boolean
}) {
  const r = 14
  const circumference = 2 * Math.PI * r
  const doneFraction = total > 0 ? (total - open) / total : 0
  const stroke = dropped ? 'var(--dropped)' : color ?? 'var(--mine)'

  return (
    <span className={`relative grid h-[34px] w-[34px] place-items-center rounded-full ${
      active ? 'ring-1 ring-mine' : ''
    }`}>
      <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true">
        {school ? (
          <>
            <rect x="4" y="4" width="28" height="28" rx="6" fill="none"
                  stroke="var(--border-2)" strokeWidth="3" />
            <rect x="4" y="4" width="28" height="28" rx="6" fill="none"
                  stroke={stroke} strokeWidth="3"
                  strokeDasharray={`${112 * doneFraction} 112`} />
          </>
        ) : (
          <>
            <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-2)" strokeWidth="3" />
            <circle cx="18" cy="18" r={r} fill="none" stroke={stroke} strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference * doneFraction} ${circumference}`}
                    transform="rotate(-90 18 18)" />
          </>
        )}
      </svg>
      <span className={`absolute text-[10px] tnum ${dropped ? 'text-dropped' : 'text-ink-2'}`}>
        {open}
      </span>
    </span>
  )
}
