'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TodoRow, type RowTodo } from '@/components/rows'
import { Button, EmptyState, ErrorBanner, Sheet, Spinner, inputClass } from '@/components/ui/primitives'
import {
  DAY_NAMES, dateForDay, mediumLabel, shiftWeeks, shortLabel,
  today as todayIso, weekStart as mondayOf,
} from '@/lib/dates'

interface WeekPayload {
  start: string
  end: string
  isCurrent: boolean
  isFuture: boolean
  today: string
  todos: RowTodo[]
  overdue: RowTodo[]
}

function WeekView() {
  const router = useRouter()
  const params = useSearchParams()

  // The week lives in the URL, so it is linkable and survives a refresh.
  const startParam = params.get('start')
  const start = startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)
    ? mondayOf(startParam)
    : mondayOf(todayIso())

  const [data, setData] = useState<WeekPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/week?start=${start}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the week.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the week.')
    } finally {
      setLoading(false)
    }
  }, [start])

  useEffect(() => { load() }, [load])

  function goto(weeks: number) {
    router.push(`/week?start=${shiftWeeks(start, weeks)}`)
  }

  async function toggle(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    setData({
      ...data,
      todos: data.todos.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t)),
      overdue: data.overdue.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t)),
    })
    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: next }),
      })
      if (!res.ok) throw new Error('That did not save.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
      load()
    }
  }

  async function addTo(date: string) {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    setAdding(null)
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Deliberately placed, so rollover leaves it alone while it is future.
        body: JSON.stringify({ title, task_date: date, placement: 'manual' }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      load()
    } catch (e) {
      setDraft(title)
      setError(e instanceof Error ? e.message : 'Could not add that.')
    }
  }

  const byDay = DAY_NAMES.map((_, index) => {
    const date = dateForDay(start, index)
    return { index, date, todos: data?.todos.filter(t => t.task_date === date) ?? [] }
  })

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => goto(-1)} aria-label="Previous week"
                  className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-2">‹</button>
          <div className="flex-1 text-center">
            <h1 className="text-lg font-semibold">
              {mediumLabel(start)} – {mediumLabel(dateForDay(start, 6))}
            </h1>
            <p className="text-[11px] text-ink-3">
              {data?.isCurrent ? 'This week' : data?.isFuture ? 'Upcoming' : 'Past'}
            </p>
          </div>
          <button onClick={() => goto(1)} aria-label="Next week"
                  className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink-2">›</button>
        </div>

        {/* Always obvious when this is not the current week, with one tap back. */}
        {data && !data.isCurrent && (
          <button
            onClick={() => router.push('/week')}
            className="mt-2 w-full rounded-md border border-mine/40 bg-mine-soft py-1.5 text-xs text-mine"
          >
            Back to this week
          </button>
        )}
      </header>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      {data && data.isFuture && (
        <p className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-[11px] text-ink-3">
          Future weeks are never rolled over and can never be late. Anything put here stays put.
        </p>
      )}

      {loading ? <Spinner label="Loading week" /> : (
        <>
          {data && data.overdue.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-dropped">
                Late · from previous weeks
              </h2>
              <div className="space-y-1.5">
                {data.overdue.map(todo => (
                  <TodoRow key={todo.id} todo={todo} showDate onToggle={() => toggle(todo)} />
                ))}
              </div>
            </section>
          )}

          <div className="space-y-4">
            {byDay.map(({ index, date, todos }) => {
              const isToday = date === data?.today
              return (
                <section key={date}>
                  <div className={`mb-1.5 flex items-baseline gap-2 px-1 ${isToday ? 'text-mine' : ''}`}>
                    <h2 className="text-[11px] font-medium uppercase tracking-wider">
                      {DAY_NAMES[index].slice(0, 3)}
                    </h2>
                    <span className="text-[11px] tnum text-ink-3">{shortLabel(date)}</span>
                    {isToday && <span className="text-[10px]">today</span>}
                    <button
                      onClick={() => { setAdding(date); setDraft('') }}
                      className="ml-auto text-[11px] text-ink-3 hover:text-ink-2"
                    >
                      + add
                    </button>
                  </div>

                  {todos.length === 0 ? (
                    <p className="px-1 text-[11px] text-ink-3">—</p>
                  ) : (
                    <div className="space-y-1.5">
                      {todos.map(todo => (
                        <TodoRow key={todo.id} todo={todo} onToggle={() => toggle(todo)} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          {data && data.todos.length === 0 && data.overdue.length === 0 && (
            <EmptyState
              title="Nothing scheduled this week."
              hint="Most work here has no date, and that is fine. Dates are for things that genuinely have to happen on a day."
            />
          )}
        </>
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)}
             title={adding ? `Add to ${mediumLabel(adding)}` : ''}>
        <div className="flex gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adding && addTo(adding)}
            placeholder="Anything…"
            className={inputClass}
          />
          <Button variant="primary" onClick={() => adding && addTo(adding)} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

export default function WeekPage() {
  return (
    <Suspense fallback={<Spinner label="Loading week" />}>
      <WeekView />
    </Suspense>
  )
}
