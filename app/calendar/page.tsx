'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TodoRow, type RowTodo } from '@/components/rows'
import { Button, ErrorBanner, Sheet, Spinner, inputClass } from '@/components/ui/primitives'
import {
  DAY_NAMES, addDays, dayIndex, longLabel, today as todayIso, weekStart,
} from '@/lib/dates'

/**
 * Month calendar, hand-rolled on CSS Grid.
 *
 * No calendar library: the fiddly parts they solve — recurring expansion,
 * drag-to-reschedule across timezones, resource lanes — are not needed here,
 * and both realistic options are desktop-first, which is the wrong bias for an
 * app used one-handed on a phone.
 *
 * Density marks rather than event chips. Most work in this system has no date
 * at all, so a month grid is legitimately sparse; dots make an empty week read
 * as calm rather than broken.
 *
 * One source of truth: this reads the same todos the week view reads, plus
 * items and coursework by their own dates. There is no calendar store.
 */

interface CalendarPayload {
  month: string
  today: string
  todos: RowTodo[]
  items: { id: string; title: string; planned_date: string | null; category_id: string | null }[]
  sweat: {
    id: string; title: string; course: string
    my_due_date: string | null; actual_due_date: string | null; is_complete: boolean
  }[]
  categories: { id: string; name: string; color: string }[]
}

function CalendarView() {
  const router = useRouter()
  const params = useSearchParams()
  const monthParam = params.get('month')
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayIso().slice(0, 7)

  const [data, setData] = useState<CalendarPayload | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/calendar?month=${month}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the calendar.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the calendar.')
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const colorOf = useMemo(() => {
    const map = new Map((data?.categories ?? []).map(c => [c.id, c.color]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [data])

  /** Six rows of seven, starting on the Monday on or before the 1st. */
  const grid = useMemo(() => {
    const first = `${month}-01`
    const gridStart = weekStart(first)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [month])

  const entriesFor = useCallback(
    (date: string) => {
      if (!data) return { todos: [], items: [], sweat: [] }
      return {
        todos: data.todos.filter(t => t.task_date === date),
        items: data.items.filter(i => i.planned_date === date),
        sweat: data.sweat.filter(s => s.my_due_date === date || s.actual_due_date === date),
      }
    },
    [data],
  )

  function shiftMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    router.push(`/calendar?month=${d.toISOString().slice(0, 7)}`)
  }

  async function addTo(date: string) {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, task_date: date, placement: 'manual' }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      load()
    } catch (e) {
      setDraft(title)
      setError(e instanceof Error ? e.message : 'Could not add that.')
    }
  }

  async function toggle(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    setData({ ...data, todos: data.todos.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t)) })
    try {
      await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: next }),
      })
    } catch {
      setError('That did not save.')
      load()
    }
  }

  if (!data) return <Spinner label="Loading calendar" />

  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${month}-01T12:00:00Z`))

  const selectedEntries = selected ? entriesFor(selected) : null

  return (
    <div className="mx-auto max-w-2xl px-3 py-5">
      <header className="mb-3 flex items-center gap-2 px-1">
        <button onClick={() => shiftMonth(-1)} aria-label="Previous month"
                className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-2">‹</button>
        <h1 className="flex-1 text-center text-lg font-semibold">{label}</h1>
        <button onClick={() => shiftMonth(1)} aria-label="Next month"
                className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-2">›</button>
        <Link href="/calendar" className="rounded-md border border-line px-2 py-1.5 text-[11px] text-ink-2">
          Today
        </Link>
      </header>

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}

      <div className="mb-1 grid grid-cols-7 gap-1 px-0.5 text-center text-[10px] text-ink-3">
        {DAY_NAMES.map(d => <span key={d}>{d[0]}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map(date => {
          const inMonth = date.slice(0, 7) === month
          const isToday = date === data.today
          const { todos, items, sweat } = entriesFor(date)
          const open = todos.filter(t => !t.is_complete)
          const marks = [
            ...open.map(t => colorOf(null) ?? 'var(--mine)'),
            ...items.map(i => colorOf(i.category_id) ?? 'var(--theirs)'),
            ...sweat.map(() => 'var(--dropped)'),
          ]
          const heavy = marks.length > 4

          return (
            <button
              key={date}
              onClick={() => setSelected(date)}
              className={`flex aspect-square flex-col gap-1 rounded-md border p-1 text-left transition-colors ${
                isToday ? 'border-mine' : selected === date ? 'border-line-2 bg-surface-2' : 'border-transparent'
              } ${inMonth ? 'bg-surface' : ''}`}
            >
              <span className={`text-[10px] tnum ${
                isToday ? 'font-bold text-mine' : inMonth ? 'text-ink-2' : 'text-ink-3 opacity-40'
              }`}>
                {Number(date.slice(-2))}
              </span>

              {heavy ? (
                <span className="h-[3px] w-full rounded-full"
                      style={{ background: 'linear-gradient(90deg, var(--mine), var(--theirs))' }} />
              ) : (
                <span className="flex flex-wrap gap-[3px]">
                  {marks.slice(0, 4).map((color, i) => (
                    <span key={i} className="h-1 w-1 rounded-full" style={{ background: color }} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-3 px-1 text-[11px] text-ink-3">
        Most work here has no date. An empty month is normal — the backlog is where it lives.
      </p>

      {/* Tap a day: check off, add, edit, without leaving the calendar. */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? longLabel(selected) : ''}
      >
        {selected && selectedEntries && (
          <div className="space-y-4">
            <div className="flex gap-1.5">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTo(selected)}
                placeholder="Add to this day…"
                className={inputClass}
              />
              <Button variant="primary" onClick={() => addTo(selected)} disabled={!draft.trim()}>Add</Button>
            </div>

            {selectedEntries.todos.length > 0 && (
              <div className="space-y-1.5">
                {selectedEntries.todos.map(todo => (
                  <TodoRow key={todo.id} todo={todo} onToggle={() => toggle(todo)} />
                ))}
              </div>
            )}

            {selectedEntries.items.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-3">Planned from the backlog</h3>
                <div className="space-y-1.5">
                  {selectedEntries.items.map(item => (
                    <Link key={item.id} href={`/items/${item.id}`}
                          className="flex items-center gap-2 rounded-md border border-line border-dashed bg-surface px-2.5 py-2">
                      <span className="h-3 w-[3px] rounded-full"
                            style={{ background: colorOf(item.category_id) ?? 'var(--border-2)' }} />
                      <span className="clamp-1 flex-1 text-sm">{item.title}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {selectedEntries.sweat.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-3">Coursework</h3>
                <div className="space-y-1.5">
                  {selectedEntries.sweat.map(s => (
                    <div key={s.id} className="rounded-md border border-line bg-surface px-2.5 py-2">
                      <div className="clamp-1 text-sm">{s.course}: {s.title}</div>
                      <SlackBar myDate={s.my_due_date} actualDate={s.actual_due_date} today={data.today} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedEntries.todos.length === 0 &&
             selectedEntries.items.length === 0 &&
             selectedEntries.sweat.length === 0 && (
              <p className="py-4 text-center text-sm text-ink-3">Nothing on this day.</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}

/**
 * The two-date model, drawn.
 *
 * The information is not the two dates, it is the distance between them and how
 * much of it has been spent. Green is time planned for; brass is the buffer
 * between your date and the professor's — the slack, visible as an actual width.
 */
export function SlackBar({
  myDate, actualDate, today,
}: {
  myDate: string | null
  actualDate: string | null
  today: string
}) {
  if (!myDate || !actualDate) {
    return (
      <div className="mt-1 text-[10px] text-ink-3">
        {myDate ? `mine ${myDate}` : actualDate ? `due ${actualDate}` : 'no dates'}
      </div>
    )
  }

  const day = 86_400_000
  const at = (d: string) => Date.parse(`${d}T12:00:00Z`)
  const span = Math.max(1, (at(actualDate) - at(today)) / day)
  const mine = Math.max(0, (at(myDate) - at(today)) / day)
  const pct = Math.min(100, Math.max(0, (mine / span) * 100))

  const pastMine = today > myDate
  const pastActual = today > actualDate

  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: pastActual ? 'var(--dropped)' : pastMine ? 'var(--mine)' : 'var(--done)',
          }}
        />
        <span className="absolute inset-y-0 w-[2px] bg-mine" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tnum text-ink-3">
        <span>mine {myDate.slice(5)}</span>
        <span className={pastActual ? 'text-dropped' : ''}>
          {Math.round(span)}d of room
        </span>
        <span>real {actualDate.slice(5)}</span>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<Spinner label="Loading calendar" />}>
      <CalendarView />
    </Suspense>
  )
}
