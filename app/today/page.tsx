'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ItemRow, TodoRow, type RowTodo } from '@/components/rows'
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

/**
 * Today.
 *
 * ORDER MATTERS HERE. Today's own work comes first. Late items — some from May
 * and June — and dropped items sit below, collapsed to a single line with a
 * count. The screen answers "what am I doing now", and a wall of things not
 * done in June actively prevents it from answering that.
 */
export default function TodayPage() {
  const [data, setData] = useState<TodayPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showLate, setShowLate] = useState(false)
  const [showDropped, setShowDropped] = useState(false)
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

  async function toggleTodo(todo: RowTodo) {
    if (!data) return
    const next = !todo.is_complete
    const patch = (list: RowTodo[]) => list.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t))
    setData({ ...data, todos: patch(data.todos), overdue: patch(data.overdue) })
    try {
      const res = await fetch(`/api/todos/${todo.id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    setData({ ...data, routines: data.routines.map(r => (r.id === id ? { ...r, checked } : r)) })
    try {
      await fetch('/api/routines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routine_id: id, date: data.date, checked }),
      })
    } catch { setError('That routine did not save.'); load() }
  }

  async function moveTodo(todo: RowTodo, date: string) {
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_date: date }),
      })
      setReschedule(null)
      load()
    } catch { setError('Could not move that.') }
  }

  if (loading) return <Spinner label="Loading today" />

  const open = data?.todos.filter(t => !t.is_complete) ?? []
  const done = data?.todos.filter(t => t.is_complete) ?? []
  const late = data?.overdue ?? []
  const dropped = data?.dropped ?? []

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <header className="mb-3 flex items-baseline gap-2">
        <h1 className="text-xl font-semibold">Today</h1>
        <span className="text-xs text-ink-2">{data ? longLabel(data.date) : ''}</span>
        {done.length > 0 && (
          <span className="ml-auto text-[11px] tnum text-ink-3">{done.length}/{data?.todos.length} done</span>
        )}
      </header>

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}

      {data && data.routines.length > 0 && (
        <button
          onClick={() => setRoutinesOpen(true)}
          className="mb-3 flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5"
          aria-label="Routines"
        >
          <span className="flex flex-1 items-center gap-1.5">
            {data.routines.map(r => (
              <span key={r.id} title={r.name}
                    className={`h-2 w-2 rounded-full ${r.checked ? 'bg-done' : 'border border-ink-3'}`} />
            ))}
          </span>
          <span className="text-[10px] tnum text-ink-3">
            {data.routines.filter(r => r.checked).length}/{data.routines.length}
          </span>
        </button>
      )}

      {/* Today's own work, first. */}
      <section className="mb-4">
        {open.length === 0 && done.length === 0 ? (
          <EmptyState
            title="Nothing scheduled today."
            hint="Most work here has no date, and that is usually correct. The backlog is where it lives."
            action={<Link href="/projects"><Button variant="quiet">Open projects</Button></Link>}
          />
        ) : (
          <div>
            {open.map(todo => (
              <TodoRow key={todo.id} todo={todo}
                       onToggle={() => toggleTodo(todo)} onOpen={() => setReschedule(todo)} />
            ))}
            {done.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer list-none py-1 text-[11px] text-ink-3">
                  {done.length} done
                </summary>
                {done.map(todo => (
                  <TodoRow key={todo.id} todo={todo} onToggle={() => toggleTodo(todo)} />
                ))}
              </details>
            )}
          </div>
        )}
      </section>

      {data && data.upcoming.length > 0 && (
        <Collapsed
          label="Coming up"
          count={data.upcoming.length}
          hint="next 7 days"
          open={false}
        >
          {data.upcoming.map(item => (
            <ItemRow key={item.id} item={item} href={`/items/${item.id}`} />
          ))}
        </Collapsed>
      )}

      {/* Below the fold by design. */}
      {dropped.length > 0 && (
        <Collapsed
          label="Needs a nudge"
          count={dropped.length}
          tone="dropped"
          hint="waiting too long"
          open={showDropped}
          onToggle={() => setShowDropped(!showDropped)}
        >
          {dropped.map(item => (
            <ItemRow key={item.id} item={item} href={`/items/${item.id}`} />
          ))}
        </Collapsed>
      )}

      {late.length > 0 && (
        <Collapsed
          label="Late"
          count={late.length}
          tone="dropped"
          hint="previous weeks"
          open={showLate}
          onToggle={() => setShowLate(!showLate)}
        >
          {late.map(todo => (
            <TodoRow key={todo.id} todo={todo} showDate
                     onToggle={() => toggleTodo(todo)} onOpen={() => setReschedule(todo)} />
          ))}
        </Collapsed>
      )}

      <Sheet open={routinesOpen} onClose={() => setRoutinesOpen(false)} title="Routines">
        <div>
          {data?.routines.map(r => (
            <button key={r.id} onClick={() => toggleRoutine(r.id, !r.checked)}
                    className="flex w-full items-center gap-3 border-b border-line/60 py-2.5 text-left last:border-b-0">
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                r.checked ? 'bg-done' : 'border border-ink-3'
              }`}>
                {r.checked && (
                  <svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="var(--bg)" strokeWidth="2.4"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-[13px] ${r.checked ? 'text-ink-3 line-through' : ''}`}>{r.name}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!reschedule} onClose={() => setReschedule(null)} title={reschedule?.title}>
        {reschedule && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {[['Today', todayIso()], ['Tomorrow', addDays(todayIso(), 1)], ['+1 week', addDays(todayIso(), 7)]].map(
                ([label, date]) => (
                  <button key={label} onClick={() => moveTodo(reschedule, date)}
                          className="rounded-md border border-line py-2 text-xs">
                    {label}
                    <span className="mt-0.5 block text-[10px] text-ink-3">{mediumLabel(date)}</span>
                  </button>
                ),
              )}
            </div>
            <input type="date" defaultValue={reschedule.task_date}
                   onChange={e => e.target.value && moveTodo(reschedule, e.target.value)}
                   className={inputClass} />
            <Button variant="danger" full onClick={async () => {
              await fetch(`/api/todos/${reschedule.id}`, { method: 'DELETE' })
              setReschedule(null); load()
            }}>Delete</Button>
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** A section that costs one line when closed. */
function Collapsed({
  label, count, children, tone, hint, open, onToggle,
}: {
  label: string
  count: number
  children: React.ReactNode
  tone?: 'dropped'
  hint?: string
  open: boolean
  onToggle?: () => void
}) {
  const [local, setLocal] = useState(open)
  const isOpen = onToggle ? open : local
  const toggle = onToggle ?? (() => setLocal(!local))

  return (
    <section className="mb-2 border-t border-line pt-2">
      <button onClick={toggle} className="flex w-full items-baseline gap-2 py-0.5 text-left">
        <span className={`text-[11px] font-medium uppercase tracking-wider ${
          tone === 'dropped' ? 'text-dropped' : 'text-ink-2'
        }`}>
          {label}
        </span>
        <span className="text-[11px] tnum text-ink-3">{count}</span>
        {hint && <span className="text-[10px] text-ink-3">{hint}</span>}
        <span className="ml-auto text-[10px] text-ink-3">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="mt-1">{children}</div>}
    </section>
  )
}
