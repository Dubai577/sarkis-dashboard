'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { TodoRow, type RowTodo } from '@/components/rows'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Button, ErrorBanner, Sheet, Spinner, inputClass } from '@/components/ui/primitives'
import { FilterBar, readFilters } from '@/components/FilterBar'
import {
  DAY_NAMES, addDays, dateForDay, dayIndex, longLabel, mediumLabel,
  shortLabel, today as todayIso, weekStart,
} from '@/lib/dates'

/**
 * One time surface: Day, Week and Month behind a single date control.
 *
 * /week used to be a separate page reading a separate endpoint, which is why
 * the two felt unrelated. All three views now ask the same range endpoint and
 * carry the same `date` in the URL, so switching view keeps position: month to
 * week lands on the week containing the date, week to day on the date itself.
 */

type View = 'day' | 'week' | 'month'

interface CalItem {
  id: string
  title: string
  planned_date: string | null
  due_date: string | null
  category_id: string | null
  possession: 'mine' | 'theirs' | 'dropped'
}

/** One thing on a date. Shared by the grid, the week list and the day sheet. */
interface CalEntry {
  id: string
  title: string
  kind: 'todo' | 'item' | 'deadline'
  color: string | null
  complete: boolean
  possession?: 'mine' | 'theirs' | 'dropped'
  todo?: RowTodo
}

interface Payload {
  from: string
  to: string
  today: string
  currentWeek: string
  todos: RowTodo[]
  items: CalItem[]
  categories: { id: string; name: string; color: string }[]
}

/** What each view needs loaded, given the anchor date. */
function rangeFor(view: View, date: string): { from: string; to: string } {
  if (view === 'day') return { from: date, to: date }
  if (view === 'week') {
    const start = weekStart(date)
    return { from: start, to: addDays(start, 6) }
  }
  const first = `${date.slice(0, 7)}-01`
  return { from: addDays(first, -7), to: addDays(first, 44) }
}

function CalendarView() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const view = (params.get('view') as View) || 'month'
  const date = params.get('date') || todayIso()
  const filters = readFilters(new URLSearchParams(params.toString()))

  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [adding, setAdding] = useState('')

  const { from, to } = rangeFor(view, date)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the calendar.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the calendar.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  /** Navigation preserves every other param, including the filters. */
  const go = (next: Partial<{ view: View; date: string }>) => {
    const p = new URLSearchParams(params.toString())
    if (next.view) p.set('view', next.view)
    if (next.date) p.set('date', next.date)
    router.replace(`${pathname}?${p}`, { scroll: false })
  }

  const step = (direction: 1 | -1) => {
    if (view === 'day') return go({ date: addDays(date, direction) })
    if (view === 'week') return go({ date: addDays(date, 7 * direction) })
    const [y, m] = date.split('-').map(Number)
    const shifted = new Date(Date.UTC(y, m - 1 + direction, 1))
    go({ date: shifted.toISOString().slice(0, 10) })
  }

  const catById = useMemo(
    () => new Map((data?.categories ?? []).map(c => [c.id, c])),
    [data?.categories],
  )

  /** Everything on a date, todos and dated items together. */
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalEntry[]>()

    const push = (d: string, entry: CalEntry) => {
      const list = map.get(d) ?? []
      list.push(entry)
      map.set(d, list)
    }

    for (const t of data?.todos ?? []) {
      push(t.task_date, {
        id: t.id, title: t.title, kind: 'todo',
        color: null, complete: t.is_complete, todo: t,
      })
    }
    for (const i of data?.items ?? []) {
      const color = i.category_id ? catById.get(i.category_id)?.color ?? null : null
      // A planned date and a deadline are different marks on the calendar.
      if (i.planned_date && i.planned_date >= from && i.planned_date <= to) {
        push(i.planned_date, {
          id: `p-${i.id}`, title: i.title, kind: 'item',
          color, complete: false, possession: i.possession,
        })
      }
      if (i.due_date && i.due_date >= from && i.due_date <= to) {
        push(i.due_date, {
          id: `d-${i.id}`, title: i.title, kind: 'deadline',
          color, complete: false, possession: i.possession,
        })
      }
    }
    return map
  }, [data, catById, from, to])

  /** Filters apply to what the cells show, not to what is loaded. */
  const visible = useCallback(
    (list: CalEntry[] | undefined): CalEntry[] => {
      if (!list) return []
      const q = filters.q.trim().toLowerCase()
      return list.filter(e => {
        if (q && !e.title.toLowerCase().includes(q)) return false
        if (filters.possession && e.possession !== filters.possession) return false
        if (filters.categories.length) {
          const name = data?.categories.find(c => c.color === e.color)?.name
          if (!name || !filters.categories.includes(name)) return false
        }
        return true
      })
    },
    [filters, data?.categories],
  )

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

  async function addTo(day: string) {
    const title = adding.trim()
    if (!title) return
    setAdding('')
    try {
      const res = await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, task_date: day, placement: 'manual' }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      load()
    } catch (e) {
      setAdding(title)
      setError(e instanceof Error ? e.message : 'Could not add that.')
    }
  }

  const label =
    view === 'day' ? longLabel(date)
      : view === 'week' ? `Week of ${mediumLabel(weekStart(date))}`
        : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          .format(new Date(`${date.slice(0, 7)}-01T12:00:00Z`))

  const offCurrent =
    view === 'month' ? date.slice(0, 7) !== (data?.today ?? '').slice(0, 7)
      : view === 'week' ? weekStart(date) !== data?.currentWeek
        : date !== data?.today

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <header className="mb-2">
        <div className="mb-2 flex items-center gap-1.5">
          <h1 className="flex-1 text-lg font-semibold">{label}</h1>
          <button onClick={() => step(-1)} aria-label="Previous"
                  className="rounded-md border border-line px-2 py-1 text-sm text-ink-2">‹</button>
          <button onClick={() => go({ date: todayIso() })}
                  className={`rounded-md border px-2 py-1 text-[11px] ${
                    offCurrent ? 'border-mine text-mine' : 'border-line text-ink-3'
                  }`}>Today</button>
          <button onClick={() => step(1)} aria-label="Next"
                  className="rounded-md border border-line px-2 py-1 text-sm text-ink-2">›</button>
        </div>

        <div className="flex gap-1">
          {(['day', 'week', 'month'] as View[]).map(v => (
            <button key={v} onClick={() => go({ view: v })}
                    className={`flex-1 rounded-md border py-1 text-[11px] capitalize ${
                      view === v ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
                    }`}>{v}</button>
          ))}
        </div>
      </header>

      <FilterBar
        state={filters}
        categories={data?.categories ?? []}
        people={[]}
        total={data?.todos.length ?? 0}
        shown={data?.todos.length ?? 0}
      />

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {loading && !data && <Spinner label="Loading" />}

      {data && view === 'month' && (
        <MonthGrid
          date={date}
          today={data.today}
          entriesByDate={entriesByDate}
          visible={visible}
          onOpenDay={setOpenDay}
        />
      )}

      {data && view === 'week' && (
        <div>
          {Array.from({ length: 7 }, (_, i) => dateForDay(weekStart(date), i)).map(day => {
            const list = visible(entriesByDate.get(day))
            return (
              <section key={day} className="mb-3">
                <div className="mb-0.5 flex items-baseline gap-2 border-b border-line pb-0.5">
                  <h2 className={`text-[11px] font-medium uppercase tracking-wider ${
                    day === data.today ? 'text-mine' : 'text-ink-2'
                  }`}>
                    {DAY_NAMES[dayIndex(day)].slice(0, 3)} {shortLabel(day)}
                  </h2>
                  <button onClick={() => setOpenDay(day)} className="ml-auto text-[10px] text-ink-3">add</button>
                </div>
                {list.length === 0
                  ? <p className="py-1 text-[11px] text-ink-3">—</p>
                  : list.map(e => <Entry key={e.id} entry={e} onToggle={toggle} />)}
              </section>
            )
          })}
        </div>
      )}

      {data && view === 'day' && (
        <div>
          {visible(entriesByDate.get(date)).length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-3">Nothing on this day.</p>
          ) : (
            visible(entriesByDate.get(date)).map(e => <Entry key={e.id} entry={e} onToggle={toggle} />)
          )}
          <div className="mt-3 flex gap-1.5">
            <input value={adding} onChange={e => setAdding(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && addTo(date)}
                   placeholder="Add to this day…" className={inputClass} />
            <Button variant="primary" onClick={() => addTo(date)}>Add</Button>
          </div>
        </div>
      )}

      <Sheet open={!!openDay} onClose={() => setOpenDay(null)}
             title={openDay ? longLabel(openDay) : undefined}>
        {openDay && (
          <div className="space-y-3">
            <div>
              {visible(entriesByDate.get(openDay)).length === 0
                ? <p className="py-2 text-[13px] text-ink-3">Nothing on this day.</p>
                : visible(entriesByDate.get(openDay)).map(e => (
                    <Entry key={e.id} entry={e} onToggle={toggle} />
                  ))}
            </div>
            <div className="flex gap-1.5">
              <input value={adding} onChange={e => setAdding(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && addTo(openDay)}
                     placeholder="Add to this day…" className={inputClass} autoFocus />
              <Button variant="primary" onClick={() => addTo(openDay)}>Add</Button>
            </div>
            <Button variant="quiet" full onClick={() => { go({ view: 'day', date: openDay }); setOpenDay(null) }}>
              Open this day
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function Entry({ entry, onToggle }: { entry: CalEntry; onToggle: (t: RowTodo) => void }) {
  if (entry.todo) {
    return <TodoRow todo={entry.todo} onToggle={() => onToggle(entry.todo!)} accent={entry.color} />
  }
  const itemId = entry.id.slice(2)
  return (
    <Link href={`/items/${itemId}`}
          className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
      <span className="h-4 w-[2px] shrink-0 rounded-full"
            style={{ background: entry.color ?? 'var(--border-2)' }} />
      <span className="clamp-1 flex-1 text-[13px] text-ink-2">{entry.title}</span>
      <span className="shrink-0 text-[9px] uppercase tracking-wide text-ink-3">
        {entry.kind === 'deadline' ? 'due' : 'planned'}
      </span>
      {entry.possession && <PossessionGlyph state={entry.possession} size={10} />}
    </Link>
  )
}

/**
 * Month grid. Cells carry actual titles rather than a count, so the month can
 * be read without tapping — which was the point. Three fit a phone cell before
 * "+N more".
 */
function MonthGrid({
  date, today, entriesByDate, visible, onOpenDay,
}: {
  date: string
  today: string
  entriesByDate: Map<string, CalEntry[]>
  visible: (list: CalEntry[] | undefined) => CalEntry[]
  onOpenDay: (d: string) => void
}) {
  const month = date.slice(0, 7)
  const first = `${month}-01`
  const gridStart = weekStart(first)
  // Six rows always, so the grid does not jump height between months.
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-px text-center text-[9px] uppercase text-ink-3">
        {DAY_NAMES.map(d => <span key={d}>{d.slice(0, 1)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md bg-line">
        {days.map(day => {
          const list = visible(entriesByDate.get(day))
          const inMonth = day.slice(0, 7) === month
          const isToday = day === today
          const shown = list.slice(0, 3)
          return (
            <button
              key={day}
              onClick={() => onOpenDay(day)}
              className={`min-h-[68px] p-1 text-left align-top ${
                inMonth ? 'bg-surface' : 'bg-bg'
              } ${isToday ? 'ring-1 ring-inset ring-mine' : ''}`}
            >
              <span className={`block text-[10px] tnum ${
                isToday ? 'font-semibold text-mine' : inMonth ? 'text-ink-2' : 'text-ink-3/50'
              }`}>
                {Number(day.slice(8))}
              </span>
              <span className="mt-0.5 flex flex-col gap-px">
                {shown.map(e => (
                  <span key={e.id} className="flex items-center gap-0.5">
                    <span className="h-1 w-1 shrink-0 rounded-full"
                          style={{ background: e.color ?? 'var(--theirs)' }} />
                    <span className={`clamp-1 text-[9px] leading-tight ${
                      e.complete ? 'text-ink-3 line-through' : 'text-ink-2'
                    }`}>
                      {e.title}
                    </span>
                  </span>
                ))}
                {list.length > 3 && (
                  <span className="text-[9px] leading-tight text-ink-3">+{list.length - 3} more</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <CalendarView />
    </Suspense>
  )
}
