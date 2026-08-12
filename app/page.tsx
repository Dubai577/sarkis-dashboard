'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { TodoRow, SlackBar, type RowTodo } from '@/components/rows'
import { PossessionGlyph } from '@/components/ui/Possession'
import { ErrorBanner, Spinner } from '@/components/ui/primitives'
import { mediumLabel, shortLabel } from '@/lib/dates'

/**
 * The dashboard — one place to see the whole thing.
 *
 * Dense and legible over impressive. Every panel is scannable at arm's length
 * on a phone: no gauges, no sparklines, no chrome. Where a number would need
 * interpreting, it says the words instead.
 */

interface Payload {
  date: string
  todos: RowTodo[]
  overdueCount: number
  droppedCount: number
  week: { date: string; total: number; done: number; isToday: boolean }[]
  projects: {
    id: string; title: string; color: string | null
    open: number; total: number; dropped: number
    possession: 'mine' | 'theirs' | 'dropped'; isSchool: boolean
  }[]
  school: { id: string; title: string; planned_date: string | null; due_date: string | null }[]
  notes: { id: string; content: string; created_at: string }[]
  routines: { total: number; done: number }
  contributors: {
    people: number
    recentDone: { id: string; who: string; what: string; project: string | null; completed_at: string | null }[]
    outstanding: { project: string; count: number }[]
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard')
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the dashboard.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.')
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onCapture = () => load()
    window.addEventListener('merc:captured', onCapture)
    return () => window.removeEventListener('merc:captured', onCapture)
  }, [load])

  async function toggle(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    setData({ ...data, todos: data.todos.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t)) })
    try {
      await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: next }),
      })
    } catch { setError('That did not save.'); load() }
  }

  if (error && !data) return <div className="p-4"><ErrorBanner message={error} onRetry={load} /></div>
  if (!data) return <Spinner label="Loading" />

  const open = data.todos.filter(t => !t.is_complete)

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}

      {/* Attention line: the two states nothing else surfaces. */}
      {(data.overdueCount > 0 || data.droppedCount > 0) && (
        <div className="mb-3 flex gap-1.5">
          {data.droppedCount > 0 && (
            <Link href="/today" className="flex-1 rounded-md border border-dropped/40 bg-dropped-soft px-2.5 py-1.5">
              <span className="block text-[10px] uppercase tracking-wide text-dropped">Needs a nudge</span>
              <span className="text-base tnum text-dropped">{data.droppedCount}</span>
            </Link>
          )}
          {data.overdueCount > 0 && (
            <Link href="/today" className="flex-1 rounded-md border border-line px-2.5 py-1.5">
              <span className="block text-[10px] uppercase tracking-wide text-ink-3">Late</span>
              <span className="text-base tnum text-ink-2">{data.overdueCount}</span>
            </Link>
          )}
        </div>
      )}

      {/* Today */}
      <Panel title="Today" href="/today" meta={`${open.length} open · routines ${data.routines.done}/${data.routines.total}`}>
        {open.length === 0 ? (
          <p className="py-1.5 text-[13px] text-ink-3">Nothing scheduled.</p>
        ) : (
          open.slice(0, 8).map(todo => (
            <TodoRow key={todo.id} todo={todo} onToggle={() => toggle(todo)} />
          ))
        )}
        {open.length > 8 && (
          <Link href="/today" className="block pt-1 text-[11px] text-ink-3">+{open.length - 8} more</Link>
        )}
      </Panel>

      {/* Week strip */}
      <Panel title="This week" href="/calendar?view=week">
        <div className="flex gap-1">
          {data.week.map(day => {
            const pct = day.total > 0 ? (day.done / day.total) * 100 : 0
            return (
              <Link
                key={day.date}
                href={`/calendar?view=day&date=${day.date}`}
                className={`flex-1 rounded-md border px-1 py-1.5 text-center ${
                  day.isToday ? 'border-mine' : 'border-line'
                }`}
              >
                <span className="block text-[9px] uppercase text-ink-3">{shortLabel(day.date)}</span>
                <span className={`block text-sm tnum ${day.total ? 'text-ink' : 'text-ink-3'}`}>
                  {day.total || '·'}
                </span>
                <span className="mt-1 block h-[2px] rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-done" style={{ width: `${pct}%` }} />
                </span>
              </Link>
            )
          })}
        </div>
      </Panel>

      {/* Projects as small rings — 15+ visible without scrolling a list */}
      <Panel title="Projects" href="/projects" meta={`${data.projects.length}`}>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8">
          {data.projects.map(p => (
            <Link key={p.id} href={`/items/${p.id}`} className="flex flex-col items-center gap-1">
              <Ring
                open={p.open}
                total={p.total}
                color={p.color}
                dropped={p.dropped > 0}
                school={p.isSchool}
              />
              <span className="clamp-1 w-full text-center text-[9px] leading-tight text-ink-3">
                {p.title}
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      {/* School: deadlines behave differently, so they read differently */}
      {data.school.length > 0 && (
        <Panel title="School" href="/list?category=School" meta="deadlines">
          {data.school.map(s => (
            <div key={s.id} className="border-b border-line/60 py-1.5 last:border-b-0">
              <Link href={`/items/${s.id}`} className="clamp-1 block text-[13px]">{s.title}</Link>
              {s.planned_date && s.due_date ? (
                <SlackBar planned={s.planned_date} deadline={s.due_date} today={data.date} />
              ) : (
                <span className="text-[10px] tnum text-ink-3">
                  {s.due_date ? `due ${mediumLabel(s.due_date)}` : `planned ${mediumLabel(s.planned_date!)}`}
                </span>
              )}
            </div>
          ))}
        </Panel>
      )}

      {/* Service: contributor activity, read-only from the portal tables */}
      <Panel
        title="Service"
        meta={`${data.contributors.people} people`}
      >
        {data.contributors.recentDone.length === 0 && data.contributors.outstanding.length === 0 ? (
          <p className="py-1.5 text-[13px] text-ink-3">Nothing assigned in the portal.</p>
        ) : (
          <>
            {data.contributors.recentDone.map(a => (
              <div key={a.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-done" />
                <span className="clamp-1 flex-1 text-[13px]">
                  <span className="text-ink">{a.who}</span>
                  <span className="text-ink-2"> — {a.what}</span>
                </span>
                {a.project && <span className="shrink-0 text-[10px] text-ink-3">{a.project}</span>}
              </div>
            ))}
            {data.contributors.outstanding.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {data.contributors.outstanding.map(o => (
                  <span key={o.project}
                        className="rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-ink-3">
                    {o.project} <span className="tnum text-ink-2">{o.count}</span>
                  </span>
                ))}
              </div>
            )}
            <p className="pt-2 text-[10px] text-ink-3">
              Portal is paused — this is read-only until it is rebuilt.
            </p>
          </>
        )}
      </Panel>

      {/* Notes */}
      <Panel title="Notes" href="/notes" meta={`${data.notes.length} recent`}>
        <div className="columns-2 gap-1.5">
          {data.notes.map(n => (
            <Link key={n.id} href="/notes"
                  className="mb-1.5 block break-inside-avoid rounded-md border border-line p-2 text-[11px] leading-snug text-ink-2">
              <span className="clamp-2 block">{n.content}</span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Panel({
  title, href, meta, children,
}: {
  title: string
  href?: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-2">{title}</h2>
        {meta && <span className="text-[10px] tnum text-ink-3">{meta}</span>}
        {href && <Link href={href} className="ml-auto text-[10px] text-ink-3">all →</Link>}
      </div>
      {children}
    </section>
  )
}

/**
 * A project at a glance: ring thickness is how much is open, the colour is the
 * category, and a broken ring means something inside has been dropped. School
 * gets a square so coursework is distinguishable without reading the label.
 */
function Ring({
  open, total, color, dropped, school,
}: {
  open: number
  total: number
  color: string | null
  dropped: boolean
  school: boolean
}) {
  const size = 34
  const r = 14
  const circumference = 2 * Math.PI * r
  const doneFraction = total > 0 ? (total - open) / total : 0

  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
        {school ? (
          <rect x="4" y="4" width="28" height="28" rx="6" fill="none"
                stroke="var(--border-2)" strokeWidth="3" />
        ) : (
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-2)" strokeWidth="3" />
        )}
        {!school && (
          <circle
            cx="18" cy="18" r={r} fill="none"
            stroke={dropped ? 'var(--dropped)' : color ?? 'var(--mine)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${circumference * doneFraction} ${circumference}`}
            transform="rotate(-90 18 18)"
            opacity={dropped ? 1 : 0.9}
          />
        )}
        {school && (
          <rect x="4" y="4" width="28" height="28" rx="6" fill="none"
                stroke={color ?? 'var(--mine)'} strokeWidth="3"
                strokeDasharray={`${112 * doneFraction} 112`} />
        )}
      </svg>
      <span className={`absolute text-[10px] tnum ${dropped ? 'text-dropped' : 'text-ink-2'}`}>
        {open}
      </span>
    </span>
  )
}
