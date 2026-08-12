'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ItemRow, TodoRow, type RowTodo } from '@/components/rows'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Button, EmptyState, ErrorBanner, Sheet, Spinner, inputClass } from '@/components/ui/primitives'
import { addDays, longLabel, mediumLabel, today as todayIso } from '@/lib/dates'

interface TodayPayload {
  date: string
  todos: RowTodo[]
  overdue: RowTodo[]
  dropped: {
    id: string; title: string; possession: 'dropped'
    category: { color: string; name: string } | null
    waiting_person: { id: string; name: string } | null
    waiting_since: string | null; nudge_after: number
  }[]
  routines: { id: string; name: string; checked: boolean }[]
  upcoming: { id: string; title: string; planned_date: string; category: { color: string; name: string } | null }[]
}

export default function TodayPage() {
  const [data, setData] = useState<TodayPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [reschedule, setReschedule] = useState<RowTodo | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/today')
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load today.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onCapture = () => load()
    window.addEventListener('merc:captured', onCapture)
    return () => window.removeEventListener('merc:captured', onCapture)
  }, [load])

  /** Optimistic: the checkbox is the most-tapped control and must feel instant. */
  async function toggleTodo(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    const patch = (list: RowTodo[]) =>
      list.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t))

    setData({ ...data, todos: patch(data.todos), overdue: patch(data.overdue) })

    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_complete: next }),
      })
      if (!res.ok) throw new Error('That did not save.')
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
      load()
    }
  }

  async function toggleRoutine(id: string, checked: boolean) {
    if (!data) return
    setData({
      ...data,
      routines: data.routines.map(r => (r.id === id ? { ...r, checked } : r)),
    })
    try {
      await fetch('/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine_id: id, date: data.date, checked }),
      })
    } catch {
      setError('That routine did not save.')
      load()
    }
  }

  async function moveTodo(todo: RowTodo, date: string) {
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_date: date }),
      })
      setReschedule(null)
      load()
    } catch {
      setError('Could not move that.')
    }
  }

  if (loading) return <Spinner label="Loading today" />

  const open = data?.todos.filter(t => !t.is_complete) ?? []
  const done = data?.todos.filter(t => t.is_complete) ?? []
  const nothingAtAll =
    open.length === 0 && (data?.overdue.length ?? 0) === 0 && (data?.dropped.length ?? 0) === 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-ink-2">{data ? longLabel(data.date) : ''}</p>
      </header>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      {/* Routines: seven glyphs, no titles at rest. They are not tasks and
          must not read as a to-do list you are behind on. */}
      {data && data.routines.length > 0 && (
        <section className="mb-5">
          <button
            onClick={() => setRoutinesOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5"
            aria-label="Routines"
          >
            <div className="flex flex-1 items-center gap-1.5">
              {data.routines.map(r => (
                <span
                  key={r.id}
                  title={r.name}
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    r.checked ? 'bg-done' : 'border border-ink-3'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] tnum text-ink-3">
              {data.routines.filter(r => r.checked).length}/{data.routines.length}
            </span>
          </button>
        </section>
      )}

      {/* Dropped first: it is the state nothing else surfaces, and the one
          that quietly kills projects. */}
      {data && data.dropped.length > 0 && (
        <Section
          label="Needs a nudge"
          count={data.dropped.length}
          tone="dropped"
          hint="Waiting longer than you meant to"
        >
          <div className="space-y-1.5">
            {data.dropped.slice(0, 6).map(item => (
              <ItemRow key={item.id} item={item} href={`/items/${item.id}`} />
            ))}
            {data.dropped.length > 6 && (
              <Link href="/projects" className="block px-1 pt-1 text-xs text-ink-3">
                {data.dropped.length - 6} more →
              </Link>
            )}
          </div>
        </Section>
      )}

      {data && data.overdue.length > 0 && (
        <Section label="Late" count={data.overdue.length} tone="dropped" hint="From previous weeks">
          <div className="space-y-1.5">
            {data.overdue.map(todo => (
              <TodoRow
                key={todo.id}
                todo={todo}
                showDate
                onToggle={() => toggleTodo(todo)}
                onOpen={() => setReschedule(todo)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section label="On today" count={open.length}>
        {open.length === 0 ? (
          nothingAtAll ? (
            <EmptyState
              title="Nothing scheduled."
              hint="An empty day is usually correct here — most of the work has no date. The backlog is where it lives."
              action={<Link href="/projects"><Button variant="quiet">Open projects</Button></Link>}
            />
          ) : (
            <p className="px-1 py-3 text-sm text-ink-3">Nothing left on today.</p>
          )
        ) : (
          <div className="space-y-1.5">
            {open.map(todo => (
              <TodoRow
                key={todo.id}
                todo={todo}
                onToggle={() => toggleTodo(todo)}
                onOpen={() => setReschedule(todo)}
              />
            ))}
          </div>
        )}
      </Section>

      {done.length > 0 && (
        <Section label="Done" count={done.length} tone="done">
          <div className="space-y-1.5">
            {done.map(todo => (
              <TodoRow key={todo.id} todo={todo} onToggle={() => toggleTodo(todo)} />
            ))}
          </div>
        </Section>
      )}

      {data && data.upcoming.length > 0 && (
        <Section label="Coming up" count={data.upcoming.length} hint="Next seven days">
          <div className="space-y-1.5">
            {data.upcoming.map(item => (
              <ItemRow key={item.id} item={item} href={`/items/${item.id}`} dense />
            ))}
          </div>
        </Section>
      )}

      {/* Routines, expanded */}
      <Sheet open={routinesOpen} onClose={() => setRoutinesOpen(false)} title="Routines">
        <div className="space-y-1">
          {data?.routines.map(r => (
            <button
              key={r.id}
              onClick={() => toggleRoutine(r.id, !r.checked)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-surface-2"
            >
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  r.checked ? 'bg-done' : 'border border-ink-3'
                }`}
              >
                {r.checked && (
                  <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="var(--bg)" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-sm ${r.checked ? 'text-ink-3 line-through' : 'text-ink'}`}>
                {r.name}
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Reschedule — the common action on a task, so it is one tap from the row */}
      <Sheet
        open={!!reschedule}
        onClose={() => setReschedule(null)}
        title={reschedule?.title}
      >
        {reschedule && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                ['Today', todayIso()],
                ['Tomorrow', addDays(todayIso(), 1)],
                ['In a week', addDays(todayIso(), 7)],
              ].map(([label, date]) => (
                <button
                  key={label}
                  onClick={() => moveTodo(reschedule, date)}
                  className="rounded-md border border-line bg-surface-2 py-2.5 text-xs"
                >
                  {label}
                  <span className="mt-0.5 block text-[10px] text-ink-3">{mediumLabel(date)}</span>
                </button>
              ))}
            </div>
            <input
              type="date"
              defaultValue={reschedule.task_date}
              onChange={e => e.target.value && moveTodo(reschedule, e.target.value)}
              className={inputClass}
            />
            <Button
              variant="danger"
              full
              onClick={async () => {
                await fetch(`/api/todos/${reschedule.id}`, { method: 'DELETE' })
                setReschedule(null)
                load()
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

function Section({
  label, count, children, tone, hint,
}: {
  label: string
  count?: number
  children: React.ReactNode
  tone?: 'dropped' | 'done'
  hint?: string
}) {
  const colour =
    tone === 'dropped' ? 'text-dropped' : tone === 'done' ? 'text-done' : 'text-ink-2'
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className={`text-[11px] font-medium uppercase tracking-wider ${colour}`}>{label}</h2>
        {count !== undefined && <span className="text-[11px] tnum text-ink-3">{count}</span>}
        {hint && <span className="ml-auto text-[11px] text-ink-3">{hint}</span>}
      </div>
      {children}
    </section>
  )
}
