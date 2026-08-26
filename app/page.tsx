'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Check, ErrorBanner, Spinner } from '@/components/ui/primitives'
import { AddChild, WaitingOnSheet } from '@/components/InlineActions'
import { Drill, type TreeNode } from '@/components/Drill'
import { ItemActions, ActionChip, type ActionTarget } from '@/components/ItemActions'
import { dayIndex, DAY_NAMES, mediumLabel } from '@/lib/dates'

/**
 * The dashboard — one tab, all of it, visible at once.
 *
 * The previous version was an accordion of panels, which was the wrong shape:
 * with 100+ items the whole job is SEEING them together, and collapsing is the
 * opposite of that. So nothing here hides. It is one long dense scroll.
 *
 * The organising axis is date state, because that is the question actually
 * being asked of it:
 *
 *   on a day    an appointment on Tuesday — a specific date
 *   due         a deadline
 *   ongoing     deliberately undated, a continuing commitment
 *   no date     none of the above, and probably needs one
 *
 * Every row can be given a date or marked ongoing in place, because the point
 * of seeing the undated pile is emptying it.
 */

interface Child {
  id: string; title: string; possession: 'mine' | 'theirs' | 'dropped'
  planned_date: string | null; due_date: string | null
  link: string | null; waiting: string | null; days: number | null
  status?: string | null
}

interface Project {
  id: string; title: string; color: string | null
  open: number; total: number; dropped: number
  isSchool: boolean; category_id: string | null; categoryName: string | null
  link: string | null
  possession: 'mine' | 'theirs' | 'dropped'
  waiting_person: { id: string; name: string } | null
  sort_order: number
  children: Child[]
}

interface Todo {
  id: string; title: string; task_date: string; is_complete: boolean
  start_time: string | null
}

interface Payload {
  date: string
  weekStart: string
  todos: Todo[]
  weekTodos: Todo[]
  overdueCount: number
  droppedCount: number
  projects: Project[]
  people: { id: string; name: string }[]
  notes: { id: string; content: string }[]
  routines: { total: number; done: number }
  tree: TreeNode[]
  contributors: { recentDone: { id: string; who: string; what: string; project: string | null }[] }
}

type Lens = 'all' | 'day' | 'due' | 'none' | 'ongoing'

const LENSES: { value: Lens; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'day', label: 'On a day' },
  { value: 'due', label: 'Due' },
  { value: 'none', label: 'No date' },
  { value: 'ongoing', label: 'Ongoing' },
]

function dateStateOf(c: Child): Lens {
  if (c.planned_date) return 'day'
  if (c.due_date) return 'due'
  if (c.status === 'Ongoing') return 'ongoing'
  return 'none'
}

function DashboardView() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const lens = (params.get('lens') as Lens) || 'all'

  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [waitingTarget, setWaitingTarget] = useState<Child | null>(null)
  const [drillRoot, setDrillRoot] = useState<string | null>(null)
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null)
  const groupRefs = useRef<Record<string, HTMLElement | null>>({})

  /**
   * Move a project past its neighbour and write both positions.
   *
   * Rewriting only the moved row is what makes hand-ordering rot: everything
   * starts at 0, so a single write puts one row in front and leaves the rest
   * tied. Renumbering the whole visible order costs one request per project
   * once, and every later move is then a clean swap.
   */
  const reorder = useCallback(async (projects: Project[], id: string, delta: number) => {
    const order = [...projects]
    const from = order.findIndex(p => p.id === id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= order.length) return
    const [moved] = order.splice(from, 1)
    order.splice(to, 0, moved)
    await Promise.all(order.map((p, i) =>
      p.sort_order === i ? null : fetch(`/api/items/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: i }),
      })))
    load()
  }, [])

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

  const setLens = (next: Lens) => {
    const p = new URLSearchParams(params.toString())
    if (next === 'all') p.delete('lens')
    else p.set('lens', next)
    router.replace(p.toString() ? `${pathname}?${p}` : pathname, { scroll: false })
  }

  async function toggleTodo(todo: Todo) {
    if (!data) return
    const next = !todo.is_complete
    const patch = (l: Todo[]) => l.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t))
    setData({ ...data, todos: patch(data.todos), weekTodos: patch(data.weekTodos) })
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

  /** Counts across every child, so a lens button shows what it will show. */
  const tally = useMemo(() => {
    const t: Record<Lens, number> = { all: 0, day: 0, due: 0, none: 0, ongoing: 0 }
    for (const p of data?.projects ?? []) {
      for (const c of p.children) { t.all++; t[dateStateOf(c)]++ }
    }
    return t
  }, [data])

  if (error && !data) return <div className="p-4"><ErrorBanner message={error} onRetry={load} /></div>
  if (!data) return <Spinner label="Loading" />

  const keep = (c: Child) => lens === 'all' || dateStateOf(c) === lens

  /**
   * Built from the whole tree, not from each project's direct children.
   *
   * A project listed its children and stopped, so a task filed into a
   * department was invisible here — the departments showed, empty-looking, and
   * the work inside them existed only if you drilled. On a page whose entire
   * claim is "everything at once" that is the one thing that must not happen.
   */
  const tree = data.tree ?? []
  const childrenOf = (id: string) => tree.filter(n => n.parent_id === id)
  const isContainer = (n: TreeNode) => n.isGroup === true || n.childCount > 0
  const asChild = (n: TreeNode): Child => ({
    id: n.id, title: n.title, possession: n.possession,
    planned_date: n.planned_date, due_date: n.due_date,
    link: n.link, waiting: n.waiting, days: null, status: n.status,
  })

  const groups = data.projects
    .map(p => {
      const direct = childrenOf(p.id)
      return {
        project: p,
        loose: direct.filter(n => !isContainer(n)).map(asChild).filter(keep),
        departments: direct.filter(isContainer).map(d => ({
          node: d,
          rows: childrenOf(d.id).map(asChild).filter(keep),
        })),
      }
    })
    .filter(g => lens === 'all'
      || g.loose.length > 0
      || g.departments.some(d => d.rows.length > 0))

  const shownRows = groups.reduce(
    (n, g) => n + g.loose.length + g.departments.reduce((m, d) => m + d.rows.length, 0),
    0,
  )
  const todayOpen = data.todos.filter(t => !t.is_complete)
  const laterThisWeek = data.weekTodos
    .filter(t => !t.is_complete && t.task_date > data.date)
    .sort((a, b) => a.task_date.localeCompare(b.task_date))

  return (
    <div className="mx-auto max-w-4xl px-3 pb-8 pt-3">
      {error && <div className="mb-2"><ErrorBanner message={error} onRetry={load} /></div>}

      {/* ── time: the two questions with an answer today ── */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <TimeBlock
          title="Today"
          when={mediumLabel(data.date)}
          count={todayOpen.length}
          href={`/calendar?view=day&date=${data.date}`}
        >
          {todayOpen.length === 0
            ? <p className="py-1 text-[12px] text-ink-3">Nothing on today.</p>
            : todayOpen.map(t => (
                <TodoLine key={t.id} todo={t} onToggle={() => toggleTodo(t)} />
              ))}
        </TimeBlock>

        <TimeBlock
          title="This week"
          when={`from ${mediumLabel(data.weekStart)}`}
          count={laterThisWeek.length}
          href="/calendar?view=week"
        >
          {laterThisWeek.length === 0
            ? <p className="py-1 text-[12px] text-ink-3">Nothing else dated this week.</p>
            : laterThisWeek.map(t => (
                <TodoLine key={t.id} todo={t} onToggle={() => toggleTodo(t)} showDay />
              ))}
        </TimeBlock>
      </div>

      {/* ── attention, one line rather than its own panel ── */}
      {(data.droppedCount > 0 || data.overdueCount > 0 || data.routines.total > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
          {data.droppedCount > 0 && (
            <span className="rounded-sm border border-dropped/40 bg-dropped-soft px-1.5 py-0.5 text-dropped">
              {data.droppedCount} need a nudge
            </span>
          )}
          {data.overdueCount > 0 && (
            <Link href="/today" className="rounded-sm border border-line px-1.5 py-0.5 text-ink-2">
              {data.overdueCount} late
            </Link>
          )}
          <span className="text-ink-3">routines {data.routines.done}/{data.routines.total}</span>
          {data.contributors.recentDone.length > 0 && (
            <span className="text-ink-3">
              {data.contributors.recentDone.length} contributor updates
            </span>
          )}
        </div>
      )}

      {/* ── the lens: re-slices everything below by date state ── */}
      <div className="sticky top-0 z-20 -mx-3 mb-2 border-b border-line bg-bg/95 px-3 py-1.5 backdrop-blur">
        <div className="no-bar flex gap-1 overflow-x-auto">
          {LENSES.map(l => (
            <button key={l.value} onClick={() => setLens(l.value)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${
                      lens === l.value ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
                    }`}>
              {l.label} <span className="tnum opacity-60">{tally[l.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── the circles: kept, and now a jump control ── */}
      <div className="no-bar mb-3 flex gap-2 overflow-x-auto pb-1">
        {data.projects.map(p => {
          const rows = p.children.filter(keep).length
          return (
            <button
              key={p.id}
              onClick={() => setDrillRoot(p.id)}
              className="flex w-[46px] shrink-0 flex-col items-center gap-0.5"
              title={`${p.title} — open it`}
            >
              <Ring open={p.open} total={p.total} color={p.color}
                    dropped={p.dropped > 0} school={p.isSchool} dimmed={rows === 0} />
              <span className="clamp-1 w-full text-center text-[8px] leading-tight text-ink-3">
                {p.title}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── every project, every task, nothing hidden ── */}
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-ink-3">
          {lens === 'all' ? 'All work' : LENSES.find(l => l.value === lens)?.label}
        </span>
        <span className="text-[10px] tnum text-ink-3">{shownRows} of {tally.all}</span>
      </div>

      {groups.map(({ project, loose, departments }, gi) => (
        <section
          key={project.id}
          ref={el => { groupRefs.current[project.id] = el }}
          /* Alternating bands. With thirty groups stacked, an unbroken page of
             identical rows is where the eye loses its place. */
          className={`mb-1.5 scroll-mt-14 rounded-md border border-line/50 px-2 py-1.5 ${
            gi % 2 === 0 ? 'bg-band-a' : 'bg-band-b'
          }`}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pb-1">
            <span className="h-3.5 w-[3px] shrink-0 self-center rounded-full"
                  style={{ background: project.color ?? 'var(--band-edge)' }} />
            <button
              onClick={() => setActionTarget({
                id: project.id, title: project.title, parent_id: null,
                planned_date: null, due_date: null, status: null,
              })}
              className="text-[13px] font-semibold tracking-tight"
            >
              {project.title}
            </button>
            <button
              onClick={() => setActionTarget({
                id: project.id, title: project.title, parent_id: null,
                planned_date: null, due_date: null, status: null,
              })}
              aria-label={`Edit ${project.title}`}
              title="Edit this project"
              className="text-[10px] leading-none text-ink-3 hover:text-mine"
            >
              ✎
            </button>
            <button onClick={() => setDrillRoot(project.id)}
                    className="text-[10px] tnum text-ink-3 underline underline-offset-2">
              {project.open} ›
            </button>
            {project.dropped > 0 && (
              <span className="text-[10px] text-dropped">{project.dropped} stalled</span>
            )}
            {project.link && (
              <a href={project.link} target="_blank" rel="noopener noreferrer"
                 className="text-[10px] text-mine underline underline-offset-2">open ↗</a>
            )}
            {project.waiting_person && (
              <span className="text-[10px] text-ink-3">waiting on {project.waiting_person.name}</span>
            )}

            {/* Put the section you are working through where you want it. */}
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              <button
                onClick={() => reorder(groups.map(g => g.project), project.id, -1)}
                disabled={gi === 0}
                aria-label={`Move ${project.title} up`}
                title="Move up"
                className="rounded-sm px-1 text-[10px] leading-none text-ink-3 hover:text-mine disabled:opacity-25"
              >
                ▲
              </button>
              <button
                onClick={() => reorder(groups.map(g => g.project), project.id, 1)}
                disabled={gi === groups.length - 1}
                aria-label={`Move ${project.title} down`}
                title="Move down"
                className="rounded-sm px-1 text-[10px] leading-none text-ink-3 hover:text-mine disabled:opacity-25"
              >
                ▼
              </button>
            </span>
          </div>

          {/* Tasks sitting directly on the project, before any department. */}
          {loose.length > 0 && (
            <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1 pb-1.5">
              {loose.map(c => (
                <Chip key={c.id} child={c} parentId={project.id}
                      onAction={t => setActionTarget(t)}
                      onWait={() => setWaitingTarget(c)} />
              ))}
            </div>
          )}

          {/*
            Columns, not rows.

            A sub-project laid out full width wastes everything to the right of
            its longest task — with seven of them stacked, most of the window is
            empty and the rest is below the fold. CSS columns pack them by
            height instead, so a wide screen shows four abreast and a phone
            still gets one. break-inside keeps a box whole.
          */}
          <div className="columns-[13.5rem] gap-1.5 [column-fill:balance]">
          {departments.map(({ node, rows }) => (
            <div
              key={node.id}
              className="mb-1.5 inline-block w-full break-inside-avoid rounded-md border-l-2 bg-band-nest py-1 pl-1.5 pr-1"
              style={{ borderColor: 'var(--band-edge)' }}
            >
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                {/* Says what it is, in words. A department that looks like a
                    task with slightly bolder type is not distinguishable at a
                    glance, and that ambiguity is the whole complaint. */}
                <span className="shrink-0 rounded-[3px] px-1 text-[8px] uppercase tracking-wider text-bg"
                      style={{ background: 'var(--band-edge)' }}>
                  sub
                </span>
                <button
                  onClick={() => setActionTarget({
                    id: node.id, title: node.title, parent_id: node.parent_id,
                    planned_date: node.planned_date, due_date: node.due_date,
                    status: node.status,
                  })}
                  className="clamp-1 min-w-0 text-left text-[11.5px] font-semibold leading-tight"
                >
                  {node.title}
                </button>
                <button
                  onClick={() => setActionTarget({
                    id: node.id, title: node.title, parent_id: node.parent_id,
                    planned_date: node.planned_date, due_date: node.due_date,
                    status: node.status,
                  })}
                  aria-label={`Edit ${node.title}`}
                  className="text-[9.5px] leading-none text-ink-3 hover:text-mine"
                >
                  ✎
                </button>
                <span className="text-[9.5px] tnum text-ink-3">{node.childCount}</span>
                {node.link && (
                  <a href={node.link} target="_blank" rel="noopener noreferrer"
                     className="text-[9.5px] text-mine">↗</a>
                )}
              </div>

              {rows.length === 0 ? (
                <p className="pt-0.5 text-[10.5px] text-ink-3">Empty.</p>
              ) : (
                <div className="flex flex-col items-start gap-y-[3px] pt-1">
                  {rows.map(c => (
                    <Chip key={c.id} child={c} parentId={node.id}
                          onAction={t => setActionTarget(t)}
                          onWait={() => setWaitingTarget(c)} />
                  ))}
                </div>
              )}

              {lens === 'all' && <AddChild parentId={node.id} onAdded={load} compact />}
            </div>
          ))}
          </div>

          {loose.length === 0 && departments.length === 0 && (
            <p className="py-0.5 text-[11px] text-ink-3">Nothing under this yet.</p>
          )}

          {lens === 'all' && (
            <AddChild parentId={project.id} categoryId={project.category_id} onAdded={load} compact />
          )}
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-8 text-center text-[13px] text-ink-3">Nothing matches this lens.</p>
      )}

      <ItemActions
        item={actionTarget}
        tree={data.tree ?? []}
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onDone={load}
      />

      {drillRoot && (
        <Drill
          tree={data.tree ?? []}
          rootId={drillRoot}
          onClose={() => setDrillRoot(null)}
          onChanged={load}
        />
      )}

      <WaitingOnSheet
        item={waitingTarget ? { ...waitingTarget, waiting_on: null } : null}
        people={data.people}
        open={!!waitingTarget}
        onClose={() => setWaitingTarget(null)}
        onDone={load}
      />
    </div>
  )
}

function TimeBlock({
  title, when, count, href, children,
}: {
  title: string; when: string; count: number; href: string; children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-line p-2">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-2">{title}</h2>
        <span className="text-[10px] tnum text-ink-3">{count}</span>
        <span className="text-[10px] text-ink-3">{when}</span>
        <Link href={href} className="ml-auto text-[10px] text-mine underline underline-offset-2">
          calendar
        </Link>
      </div>
      {children}
    </section>
  )
}

function TodoLine({
  todo, onToggle, showDay,
}: {
  todo: Todo; onToggle: () => void; showDay?: boolean
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line/60 py-1 last:border-b-0">
      <Check checked={todo.is_complete} onChange={onToggle} label={`Complete ${todo.title}`} />
      <span className={`clamp-1 flex-1 text-[12px] ${todo.is_complete ? 'text-ink-3 line-through' : ''}`}>
        {todo.title}
      </span>
      <span className="shrink-0 text-[10px] tnum text-ink-3">
        {showDay ? DAY_NAMES[dayIndex(todo.task_date)].slice(0, 3) : ''}
        {todo.start_time ? ` ${todo.start_time.slice(0, 5)}` : ''}
      </span>
    </div>
  )
}

/**
 * One task, sized to its own content.
 *
 * This used to be a full-width row with the title on flex-1 and the metadata
 * pinned right. Measured on real data that left an average of 187px of dead
 * space per row — "Ali" was 14px of text in a 287px box, so 78% of the line
 * was air, and 47 of 69 rows had over 60px of it. Titles here have a median of
 * 15 characters, so one-per-line was simply the wrong shape.
 *
 * As chips they flow and wrap: three or four short items share a line, and a
 * long one takes the width it needs and no more. A 473-character title still
 * behaves, because the chip caps at the container and clamps to one line.
 */
function Chip({
  child, parentId, onAction, onWait,
}: {
  child: Child
  parentId: string
  onAction: (t: ActionTarget) => void
  onWait: () => void
}) {
  const target: ActionTarget = {
    id: child.id, title: child.title, parent_id: parentId,
    planned_date: child.planned_date, due_date: child.due_date,
    status: child.status ?? null,
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line/70 py-[3px] pl-1.5 pr-1 leading-none">
      {/*
        The title used to be a link to the item's own page, which is the one
        thing this dashboard exists to avoid: you came here to see everything
        at once and it sent you somewhere showing one thing. It opens the
        editor in place instead. The pencil is the same action, said out loud,
        because a title that happens to be clickable is not an affordance.
      */}
      <button
        onClick={() => onAction(target)}
        className="clamp-1 min-w-0 text-left text-[12px] leading-tight"
      >
        {child.title}
      </button>


      {child.waiting && (
        <button onClick={onWait}
                className={`shrink-0 text-[9.5px] tnum ${
                  child.possession === 'dropped' ? 'text-dropped' : 'text-ink-3'
                }`}>
          {child.waiting.split(' ')[0]}{child.days !== null ? ` ${child.days}d` : ''}
        </button>
      )}

      {child.link && (
        <a href={child.link} target="_blank" rel="noopener noreferrer"
           className="shrink-0 text-[9.5px] text-mine">↗</a>
      )}

      <button
        onClick={() => onAction(target)}
        aria-label={`Edit ${child.title}`}
        title="Edit — what it is, when it is due, where it lives"
        className="shrink-0 text-[10px] leading-none text-ink-3 hover:text-mine"
      >
        ✎
      </button>

      {/* Shows the current date state, and opens the same editor. */}
      <ActionChip item={target} onOpen={() => onAction(target)} />

      {child.possession !== 'mine' && (
        <PossessionGlyph state={child.possession} size={9} />
      )}
    </span>
  )
}

function Ring({
  open, total, color, dropped, school, dimmed,
}: {
  open: number; total: number; color: string | null
  dropped: boolean; school: boolean; dimmed: boolean
}) {
  const r = 13
  const circumference = 2 * Math.PI * r
  const doneFraction = total > 0 ? (total - open) / total : 0
  const stroke = dropped ? 'var(--dropped)' : color ?? 'var(--mine)'

  return (
    <span className={`relative grid h-[32px] w-[32px] place-items-center ${dimmed ? 'opacity-30' : ''}`}>
      <svg width="32" height="32" viewBox="0 0 36 36" aria-hidden="true">
        {school ? (
          <>
            <rect x="5" y="5" width="26" height="26" rx="6" fill="none" stroke="var(--border-2)" strokeWidth="3" />
            <rect x="5" y="5" width="26" height="26" rx="6" fill="none" stroke={stroke} strokeWidth="3"
                  strokeDasharray={`${104 * doneFraction} 104`} />
          </>
        ) : (
          <>
            <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border-2)" strokeWidth="3" />
            <circle cx="18" cy="18" r={r} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${circumference * doneFraction} ${circumference}`}
                    transform="rotate(-90 18 18)" />
          </>
        )}
      </svg>
      <span className={`absolute text-[9px] tnum ${dropped ? 'text-dropped' : 'text-ink-2'}`}>{open}</span>
    </span>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <DashboardView />
    </Suspense>
  )
}
