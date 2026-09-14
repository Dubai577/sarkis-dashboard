'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { PossessionGlyph } from '@/components/ui/Possession'
import { Check, ErrorBanner, Spinner } from '@/components/ui/primitives'
import { AddChild, WaitingOnSheet } from '@/components/InlineActions'
import { Drill, type TreeNode } from '@/components/Drill'
import { ItemActions, ActionChip, type ActionTarget } from '@/components/ItemActions'
import {
  ChevronDownIcon, ChevronUpIcon, ExternalIcon, PencilIcon,
} from '@/components/ui/Icon'
import { dayIndex, DAY_NAMES, mediumLabel, relativeTime } from '@/lib/dates'

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
  progress?: 'in_progress' | 'done' | null
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
  /** The item this was materialised from, if any. */
  source_item_id?: string | null
  /** The date it was originally meant to happen, before any rollover. */
  origin_date?: string | null
  roll_count?: number | null
}

interface ExecUpdate {
  id: string; task_id: string; task_title: string
  author_name: string | null; note: string; created_at: string
  source?: string
}

/** Club names for the comments panel, keyed by portal source. */
const PORTAL_NAMES: Record<string, string> = { 'exec-portal': 'OCCM', h4hvt: 'H4HVT' }

interface Payload {
  date: string
  weekStart: string
  execPortal?: { updates: ExecUpdate[]; available: boolean; syncedAt: string | null }
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

/** One day on, as a string, without dragging a timezone into it. */
function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

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
  /**
   * Classes opened past the two-week horizon.
   *
   * A term of coursework is 160 rows; showing all of it on the dashboard buries
   * everything else you own. Two weeks is the span you can actually act on, and
   * the rest is one click away per class rather than always underfoot.
   */
  const [openedFully, setOpenedFully] = useState<Set<string>>(new Set())
  /**
   * Projects showing their finished work. Hidden by default: a term of
   * ticked-off coursework is a record, not a plan, and on the board it was
   * pushing the unfinished work below the fold. A count beside the title
   * says it is there; one click shows it.
   */
  const [showDone, setShowDone] = useState<Set<string>>(new Set())
  /**
   * Board or compact.
   *
   * The board is a column of full-width project rows; with sixteen projects,
   * four fit a screen and the rest is scrolling. Compact is the same projects
   * as a grid of small cards — every one on a single screen, each carrying
   * the three numbers that matter (open, late, next due) and opening the
   * drill on tap. The board is for working; compact is for seeing everything.
   */
  const [boardMode, setBoardMode] = useState<'board' | 'compact'>('board')
  // Read after mount: this component is server-rendered first, where there is
  // no localStorage, and a different initial value on the client would make
  // hydration disagree with the server's markup.
  useEffect(() => {
    try { if (localStorage.getItem('merc.boardMode') === 'compact') setBoardMode('compact') } catch {}
  }, [])
  const setMode = (m: 'board' | 'compact') => {
    setBoardMode(m)
    try { localStorage.setItem('merc.boardMode', m) } catch {}
  }
  /**
   * How rows are ordered inside a single day.
   *
   * A day is a bag of a dozen things from five classes, and which order they
   * are in changes what the list is for: by deadline it is triage, by class it
   * is a work session, by name it is a lookup.
   */
  const [daySort, setDaySort] = useState<'due' | 'class' | 'name' | 'priority'>('due')
  /** Flip the chosen order: latest first, lowest priority first, Z to A. */
  const [dayDesc, setDayDesc] = useState(false)
  /**
   * Show only one area of your life on the day: the top-level project a row
   * ultimately sits under — VT, Convent, OCCM Exec. Chips are built from what
   * is actually on the day, so an area with nothing today is not offered.
   */
  const [dayArea, setDayArea] = useState<string | null>(null)
  /**
   * Ticked in the last couple of seconds, and therefore still in place.
   *
   * Sorting completed rows to the bottom the instant the box is checked makes
   * the row you just clicked leap away under the cursor — you lose your place,
   * and an accidental tick is hard to find again to undo. Holding it for two
   * seconds lets the strike-through register as a result of what you did
   * before the list rearranges itself.
   */
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set())
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

  /**
   * Pull the portal when you open the dashboard and the last pull is old.
   *
   * The hourly cron bounds staleness at an hour; this bounds it at "when you
   * looked". It runs after the page has rendered so a slow portal never
   * delays the dashboard, and it re-loads only if something actually changed.
   * Once per page open, never in a loop.
   */
  const refreshedExec = useRef(false)
  useEffect(() => {
    if (!data || refreshedExec.current) return
    const at = data.execPortal?.syncedAt
    const ageMin = at ? (Date.now() - Date.parse(at)) / 60000 : Infinity
    if (ageMin < 15) return
    refreshedExec.current = true
    fetch('/api/exec-portal/sync', { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(rep => {
        if (rep && (rep.created || rep.updated || rep.archived || rep.updatesStored)) load()
      })
      .catch(() => {})
  }, [data, load])
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

  /**
   * Put something straight on a day.
   *
   * Capture asks what kind of thing it is and where it belongs, which is the
   * right question for something you are filing and the wrong one for "call
   * the pharmacy today". This makes a plain dated task and nothing else.
   */
  async function addTodo(date: string, title: string) {
    const text = title.trim()
    if (!text) return
    try {
      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, target: 'todo', task_date: date }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that.')
    }
  }

  async function toggleTodo(todo: Todo) {
    if (!data) return
    const next = !todo.is_complete
    const patch = (l: Todo[]) => l.map(t => (t.id === todo.id ? { ...t, is_complete: next } : t))

    /**
     * The row strikes through immediately and moves two seconds later.
     *
     * The tick is the feedback; the reordering is the consequence. Doing both
     * at once means the thing you just clicked leaps out from under the cursor
     * before you have seen it register — and an accidental tick becomes hard to
     * find again to undo.
     */
    const settle = () =>
      setTimeout(() => setJustChecked(prev => {
        const n = new Set(prev)
        n.delete(todo.id)
        return n
      }), 2000)

    if (next) {
      setJustChecked(prev => new Set(prev).add(todo.id))
      settle()
    } else {
      setJustChecked(prev => { const n = new Set(prev); n.delete(todo.id); return n })
    }

    // The source item carries the same completion, so anywhere it appears
    // outside the day view strikes through with it.
    const tree = (data.tree ?? []).map(n =>
      n.id === todo.source_item_id ? { ...n, progress: next ? 'done' as const : null } : n)
    setData({ ...data, todos: patch(data.todos), weekTodos: patch(data.weekTodos), tree })

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

  /**
   * Counts across every leaf in the tree, so a lens button shows what it will
   * show. This counted each project's direct children only, which was true
   * when the board was two levels deep and became a lie the moment work lived
   * inside departments: 160 assignments with due dates reported as "Due 1".
   */
  const tally = useMemo(() => {
    const t: Record<Lens, number> = { all: 0, day: 0, due: 0, none: 0, ongoing: 0 }
    const nodes = data?.tree ?? []
    const holds = new Set(nodes.map(n => n.parent_id).filter(Boolean) as string[])
    for (const n of nodes) {
      // Containers are not work; counting them inflates every bucket.
      if (!n.parent_id || n.isGroup === true || holds.has(n.id)) continue
      // Someone else's task is not in your lens counts either.
      if (n.foreign) continue
      t.all++
      t[dateStateOf({
        id: n.id, title: n.title, possession: n.possession,
        planned_date: n.planned_date, due_date: n.due_date,
        link: n.link, waiting: n.waiting, days: null, status: n.status,
      })]++
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
  // Two weeks out, as a plain date string so the comparison stays a string
  // compare — the same discipline every other date check here uses.
  const horizon = (() => {
    const d = new Date(`${data.date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 14)
    return d.toISOString().slice(0, 10)
  })()
  const childrenOf = (id: string) => tree.filter(n => n.parent_id === id)
  const isContainer = (n: TreeNode) => n.isGroup === true || n.childCount > 0
  const asChild = (n: TreeNode): Child => ({
    id: n.id, title: n.title, possession: n.possession,
    planned_date: n.planned_date, due_date: n.due_date,
    link: n.link, waiting: n.waiting, days: null, status: n.status,
    progress: n.progress ?? null,
  })

  const groups = data.projects
    .map(p => {
      const direct = childrenOf(p.id)
      const horizoned = p.title.trim().toUpperCase() === 'VT'
      const showingDone = showDone.has(p.id)
      let doneCount = 0
      const dropDone = (rows: Child[]) => {
        const done = rows.filter(c => c.progress === 'done')
        doneCount += done.length
        return showingDone ? rows : rows.filter(c => c.progress !== 'done')
      }
      const loose = dropDone(direct.filter(n => !isContainer(n)).map(asChild).filter(keep))
      const departments = direct.filter(isContainer).map(d => {
        const all = dropDone(childrenOf(d.id).map(asChild).filter(keep))
        // Only coursework is capped; a convent department has no horizon.
        const capped = horizoned && !openedFully.has(d.id)
          ? all.filter(c => !c.due_date || c.due_date <= horizon)
          : all
        return { node: d, rows: capped, hiddenCount: all.length - capped.length }
      })
      return { project: p, loose, departments, doneCount }
    })
    .filter(g => lens === 'all'
      || g.loose.length > 0
      || g.departments.some(d => d.rows.length > 0))

  /**
   * What a card says about a project: everything under it at any depth, not
   * just direct children, because a project of departments has nothing
   * directly under it and would read as empty.
   */
  const cardStats = (projectId: string) => {
    const nodes = data.tree ?? []
    const under: TreeNode[] = []
    const walk = (id: string, guard: Set<string>) => {
      for (const n of nodes) {
        if (n.parent_id !== id || guard.has(n.id)) continue
        guard.add(n.id)
        under.push(n)
        walk(n.id, guard)
      }
    }
    walk(projectId, new Set())
    const leaves = under.filter(n => n.isGroup !== true && !under.some(c => c.parent_id === n.id))
    const open = leaves.filter(n => n.progress !== 'done' && !n.foreign)
    const late = open.filter(n => n.due_date && n.due_date < data.date)
    const next = open
      .map(n => n.planned_date && n.planned_date >= data.date ? n.planned_date : n.due_date)
      .filter((d): d is string => !!d && d >= data.date)
      .sort()[0] ?? null
    const depts = under.filter(n => n.parent_id === projectId && n.isGroup === true).length
    return { open: open.length, late: late.length, next, depts, done: leaves.length - open.length }
  }

  const shownRows = groups.reduce(
    (n, g) => n + g.loose.length + g.departments.reduce((m, d) => m + d.rows.length, 0),
    0,
  )
  const twoWeeksAgo = Date.now() - 14 * 86400000
  const recentExec = (data.execPortal?.updates ?? [])
    .filter(u => Date.parse(u.created_at) >= twoWeeksAgo)

  const todayOpen = data.todos.filter(t => !t.is_complete)
  /**
   * Ticking something off made it vanish, which reads as "did that delete it?"
   * and takes away the only reward the list gives you — seeing what you got
   * through. Done work stays on today, struck through, and sinks below what is
   * still open. Tapping it again puts it back.
   */
  const settled = (t: Todo) => t.is_complete && !justChecked.has(t.id)
  const todayAll = [...data.todos].sort((a, b) =>
    Number(settled(a)) - Number(settled(b))
    || (a.start_time ?? '').localeCompare(b.start_time ?? ''))

  /**
   * Dated work from the tree, which Today and This week never showed.
   *
   * Both blocks read the todos table alone. Coursework is items, so 160
   * assignments with due dates were invisible here while showing up on the
   * calendar and under All work — the dashboard disagreeing with itself about
   * what today holds.
   *
   * Planned and due both qualify and are labelled differently: planned is when
   * you meant to do it, due is when it is owed, and on this page the two are
   * genuinely different answers to "what about today".
   */
  /**
   * Items already materialised as a todo, so they are not listed twice.
   *
   * lib/db/sync.ts turns every planned item into a todo, which is what makes it
   * tickable and what lets rollover walk it forward when a day goes by
   * unchecked. Listing the item as well showed each assignment twice — once
   * bare from the todo, once again with its class. The todo wins because it can
   * be completed; the class label moves onto it instead.
   */
  const mirrored = new Set(
    [...data.todos, ...data.weekTodos].map(t => t.source_item_id).filter(Boolean) as string[],
  )

  const datedOn = (from: string, to: string) => (data.tree ?? [])
    .filter(n => n.parent_id && n.isGroup !== true)
    .filter(n => n.progress !== 'done')
    .filter(n => !mirrored.has(n.id))
    .map(n => {
      /**
       * A teammate's deadline is not yours — but checking in on it is. A
       * foreign task reaches your day only as its follow-up, the day before
       * it is owed, and stays on today once that has passed.
       */
      if (n.foreign) {
        const f = n.followUp
        if (!f || f.date < from || f.date > to) return null
        return { node: n, when: f.date, kind: 'followup' as const }
      }
      const planned = n.planned_date && n.planned_date >= from && n.planned_date <= to
      const due = n.due_date && n.due_date >= from && n.due_date <= to
      if (!planned && !due) return null
      return { node: n, when: (planned ? n.planned_date : n.due_date)!, kind: planned ? 'planned' as const : 'due' as const }
    })
    .filter(Boolean)
    .sort((a, b) => a!.when.localeCompare(b!.when) || a!.node.title.localeCompare(b!.node.title))

  const itemsToday = datedOn(data.date, data.date) as { node: TreeNode; when: string; kind: 'planned' | 'due' | 'followup' }[]
  const weekEnd = (() => {
    const d = new Date(`${data.weekStart}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().slice(0, 10)
  })()
  const itemsThisWeek = (datedOn(
    data.date > data.weekStart ? nextDay(data.date) : data.weekStart, weekEnd,
  ) as { node: TreeNode; when: string; kind: 'planned' | 'due' | 'followup' }[])

  /**
   * Next week, in full.
   *
   * On a Thursday "this week" is two days, and the thing that decides what
   * you do with them is what Monday holds. The block splits: the rest of this
   * week above, all of next below, each day its own group.
   */
  const nextWeekStart = nextDay(weekEnd)
  const nextWeekEnd = (() => {
    const d = new Date(`${nextWeekStart}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().slice(0, 10)
  })()
  const nextWeekTodos = data.weekTodos
    .filter(t => !t.is_complete && t.task_date >= nextWeekStart && t.task_date <= nextWeekEnd)
    .sort((a, b) => a.task_date.localeCompare(b.task_date))
  const itemsNextWeek = datedOn(nextWeekStart, nextWeekEnd) as {
    node: TreeNode; when: string; kind: 'planned' | 'due' | 'followup'
  }[]

  const laterThisWeek = data.weekTodos
    .filter(t => !t.is_complete && t.task_date > data.date && t.task_date <= weekEnd)
    .sort((a, b) => a.task_date.localeCompare(b.task_date))

  /**
   * The rest of the week, a day at a time.
   *
   * One undifferentiated list of everything before Sunday answers "how much is
   * coming" and not "what is Thursday", and Thursday is the question you act
   * on. Days with nothing in them are omitted rather than shown empty: a column
   * of blanks is noise, and the gap between two headers already says the day
   * is free.
   */
  /**
   * One list per day, whatever a row came from.
   *
   * Todos and items were rendered as two blocks, so a day was implicitly
   * sorted "everything materialised, then everything else" — an ordering that
   * means nothing to anyone. Merged, a day can be ordered by the thing you
   * actually want.
   */
  type DayRow = {
    key: string
    todo?: Todo
    item?: { node: TreeNode; kind: 'planned' | 'due' | 'followup' }
    /** Finished and past its two-second hold, so it belongs at the bottom. */
    done: boolean
    due: string
    cls: string
    name: string
    /** The top-level project it lives under; '' for a plain dated task. */
    root: string
    /** Urgent 0, Soon 1, Whenever 2, unset 3 — so a plain sort puts urgent first. */
    pri: number
  }

  const PRI: Record<string, number> = { Urgent: 0, Soon: 1, Whenever: 2 }
  const rootOf = (n: TreeNode | undefined, nodes: TreeNode[]): string => {
    let cur = n
    const guard = new Set<string>()
    while (cur?.parent_id && !guard.has(cur.id)) {
      guard.add(cur.id)
      cur = nodes.find(x => x.id === cur!.parent_id)
    }
    return cur?.title ?? ''
  }

  const toRows = (todos: Todo[], items: typeof itemsToday): DayRow[] => {
    const nodes = data.tree ?? []
    const rows: DayRow[] = todos.map(t => {
      const src = t.source_item_id ? nodes.find(n => n.id === t.source_item_id) : undefined
      const parent = src?.parent_id ? nodes.find(n => n.id === src.parent_id) : undefined
      return {
        key: `t-${t.id}`, todo: t, done: settled(t),
        // A blank deadline sorts last, never first: no date is not "urgent".
        due: src?.due_date ?? '9999-12-31',
        cls: parent?.title ?? '\uffff', name: t.title,
        root: rootOf(src, nodes),
        pri: PRI[src?.priority ?? ''] ?? 3,
      }
    })
    for (const it of items) {
      const parent = it.node.parent_id ? nodes.find(n => n.id === it.node.parent_id) : undefined
      rows.push({
        key: `i-${it.node.id}`, item: it, done: it.node.progress === 'done',
        due: it.node.due_date ?? '9999-12-31',
        cls: parent?.title ?? '\uffff', name: it.node.title,
        root: rootOf(it.node, nodes),
        pri: PRI[it.node.priority ?? ''] ?? 3,
      })
    }
    const shown = dayArea ? rows.filter(r => r.root === dayArea) : rows
    const cmp = (a: DayRow, b: DayRow): number => {
      if (daySort === 'priority') return a.pri - b.pri
      const by = daySort === 'due' ? 'due' : daySort === 'class' ? 'cls' : 'name'
      return a[by].localeCompare(b[by])
    }
    /**
     * Finished work sinks, whatever the chosen order and direction.
     *
     * This sorted by the chosen key alone, which threw away the completed-last
     * ordering the caller had already applied — so ticked rows stayed scattered
     * through the list and the two-second settle had nothing to settle into.
     * Done-ness outranks every other key: a finished thing is not competing for
     * attention with an unfinished one, whatever their deadlines say.
     */
    return shown.sort((a, b) =>
      Number(a.done) - Number(b.done)
      || (dayDesc ? -1 : 1) * cmp(a, b)
      || a.name.localeCompare(b.name))
  }

  const byDay = (todos: Todo[], items: typeof itemsThisWeek) => {
    const buckets = new Map<string, { todos: Todo[]; items: typeof itemsThisWeek }>()
    const bucket = (d: string) => {
      const b = buckets.get(d) ?? { todos: [], items: [] }
      buckets.set(d, b)
      return b
    }
    for (const t of todos) bucket(t.task_date).todos.push(t)
    for (const i of items) bucket(i.when).items.push(i)
    return [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }
  const areasOnShow = (() => {
    const nodes = data.tree ?? []
    const roots = new Set<string>()
    const add = (n: TreeNode | undefined) => { const r = rootOf(n, nodes); if (r) roots.add(r) }
    for (const t of [...data.todos, ...laterThisWeek, ...nextWeekTodos]) {
      add(t.source_item_id ? nodes.find(n => n.id === t.source_item_id) : undefined)
    }
    for (const i of [...itemsToday, ...itemsThisWeek, ...itemsNextWeek]) add(i.node)
    return [...roots].sort()
  })()

  const weekByDay = byDay(laterThisWeek, itemsThisWeek)
  const nextWeekByDay = byDay(nextWeekTodos, itemsNextWeek)

  return (
    <div className="mx-auto max-w-4xl px-3 pb-8 pt-3">
      {error && <div className="mb-2"><ErrorBanner message={error} onRetry={load} /></div>}

      {/* ── time: the two questions with an answer today ── */}
      <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="text-[10px] uppercase tracking-wider text-ink-3">Order by</span>
        {([['due', 'Deadline'], ['priority', 'Priority'], ['class', 'Class'], ['name', 'Name']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setDaySort(v)}
            className={`rounded-full border px-2 py-px text-[10.5px] ${
              daySort === v ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setDayDesc(d => !d)}
          title={dayDesc ? 'Latest / lowest first — click for the usual order' : 'Click for latest / lowest first'}
          className={`rounded-full border px-2 py-px text-[10.5px] ${
            dayDesc ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
          }`}
        >
          {dayDesc ? '\u2193 reversed' : '\u2191'}
        </button>

        {areasOnShow.length > 1 && (
          <>
            <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-3">Show</span>
            <button
              onClick={() => setDayArea(null)}
              className={`rounded-full border px-2 py-px text-[10.5px] ${
                dayArea === null ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
              }`}
            >
              All
            </button>
            {areasOnShow.map(a => (
              <button
                key={a}
                onClick={() => setDayArea(dayArea === a ? null : a)}
                className={`rounded-full border px-2 py-px text-[10.5px] ${
                  dayArea === a ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
                }`}
              >
                {a}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <TimeBlock
          title="Today"
          when={mediumLabel(data.date)}
          count={todayOpen.length + itemsToday.length}
          href={`/calendar?view=day&date=${data.date}`}
        >
          <AddToDay date={data.date} onAdd={addTodo} />
          {todayAll.length === 0 && itemsToday.length === 0 ? (
            <p className="py-1 text-[12px] text-ink-3">Nothing on today.</p>
          ) : (
            toRows(todayAll, itemsToday).map(r =>
              r.todo ? (
                <TodoLine key={r.key} todo={r.todo} onToggle={() => toggleTodo(r.todo!)}
                          tree={data.tree ?? []} today={data.date} onEdit={setActionTarget} onChanged={load} />
              ) : (
                <DatedItem key={r.key} node={r.item!.node} kind={r.item!.kind}
                           tree={data.tree ?? []} onOpen={t => setActionTarget(t)} />
              ),
            )
          )}
        </TimeBlock>

        <TimeBlock
          title="This week"
          when={`from ${mediumLabel(data.weekStart)}`}
          count={laterThisWeek.length + itemsThisWeek.length}
          href="/calendar?view=week"
        >
          {/* The rest of this week, then all of next, split horizontally. */}
          <WeekHalf
            days={weekByDay}
            empty="Nothing else dated this week."
            addTodo={addTodo}
            toRows={toRows}
            tree={data.tree ?? []}
            today={data.date}
            onToggle={toggleTodo}
            onEdit={setActionTarget}
            onChanged={load}
          />

          <div className="mt-2 flex items-baseline gap-2 border-t-2 border-line pt-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-ink-2">Next week</h3>
            <span className="text-[10px] tnum text-ink-3">
              {nextWeekTodos.length + itemsNextWeek.length}
            </span>
            <span className="text-[10px] text-ink-3">from {mediumLabel(nextWeekStart)}</span>
          </div>
          <WeekHalf
            days={nextWeekByDay}
            empty="Nothing dated next week yet."
            addTodo={addTodo}
            toRows={toRows}
            tree={data.tree ?? []}
            today={data.date}
            onToggle={toggleTodo}
            onEdit={setActionTarget}
            onChanged={load}
          />
        </TimeBlock>
      </div>

      {/*
        Comments from the exec portal — recent ones only.

        This sat at the top of the page, full width, showing every stored
        comment including a month-old thread. Up there, with no framing, it
        read as a stray text box. It sits under the day view now, shows only
        the last two weeks, and disappears entirely when there is nothing
        recent: an empty or stale panel is noise, not information.
      */}
      {data.execPortal?.available && recentExec.length > 0 && (
        <div className="mb-3">
          <TimeBlock
            title="Exec team comments"
            when="last 14 days"
            count={recentExec.length}
            href="https://occmvt.vercel.app/exec/tasks"
          >
            {recentExec.slice(0, 8).map(u => (
              <div key={u.id} className="border-b border-line/60 py-1 last:border-b-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="shrink-0 text-[11px] font-medium text-ink">
                    {u.author_name ?? 'Someone'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-3" title={u.task_title}>
                    on {u.task_title}
                    {u.source && PORTAL_NAMES[u.source] && (
                      <span className="ml-1 rounded-sm bg-surface-3 px-1 text-[9px]">{PORTAL_NAMES[u.source]}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[10px] tnum text-ink-3">
                    {relativeTime(u.created_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{u.note}</p>
              </div>
            ))}
          </TimeBlock>
        </div>
      )}


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
        <span className="ml-auto flex gap-0.5 rounded-md border border-line p-0.5">
          {(['board', 'compact'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-px text-[10.5px] ${
                boardMode === m ? 'bg-mine text-bg' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {m === 'board' ? 'Board' : 'Compact'}
            </button>
          ))}
        </span>
      </div>

      {boardMode === 'compact' && (
        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {groups.map(({ project }) => {
            const st = cardStats(project.id)
            return (
              <button
                key={project.id}
                onClick={() => setDrillRoot(project.id)}
                className="group flex flex-col rounded-xl border border-line/40 bg-surface p-2.5 text-left shadow-card
                           hover:border-mine/50 hover:shadow-pop"
              >
                <div className="mb-1 flex items-start gap-1.5">
                  <span className="mt-[3px] h-3 w-[3px] shrink-0 rounded-full"
                        style={{ background: project.color ?? 'var(--band-edge)' }} />
                  <span className="min-w-0 break-words text-[12px] font-semibold leading-tight">
                    {project.title}
                  </span>
                </div>
                <div className="mt-auto flex items-baseline gap-1.5">
                  <span className={`text-[22px] font-semibold leading-none tnum ${
                    st.open === 0 ? 'text-ink-3' : 'text-ink'
                  }`}>
                    {st.open}
                  </span>
                  <span className="text-[10px] text-ink-3">open</span>
                  {st.late > 0 && (
                    <span className="ml-auto rounded-full bg-dropped-soft px-1.5 text-[10px] font-medium tnum text-dropped">
                      {st.late} late
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-ink-3">
                  {st.next && <span>next {mediumLabel(st.next)}</span>}
                  {st.depts > 0 && <span>{st.depts} sub</span>}
                  {st.done > 0 && <span>{st.done} done</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {boardMode === 'board' && groups.map(({ project, loose, departments, doneCount }, gi) => (
        <section
          key={project.id}
          ref={el => { groupRefs.current[project.id] = el }}
          /* Alternating bands. With thirty groups stacked, an unbroken page of
             identical rows is where the eye loses its place. */
          className={`mb-2 scroll-mt-14 rounded-xl border border-line/40 px-2.5 py-2 shadow-card ${
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
              className="rounded-md p-1 text-ink-3 hover:bg-band-nest hover:text-mine"
            >
              <PencilIcon size={12} />
            </button>
            {doneCount > 0 && (
              <button
                onClick={() => setShowDone(prev => {
                  const n = new Set(prev)
                  n.has(project.id) ? n.delete(project.id) : n.add(project.id)
                  return n
                })}
                className={`rounded-full border px-1.5 text-[10px] tnum ${
                  showDone.has(project.id)
                    ? 'border-done bg-done-soft text-done'
                    : 'border-line text-ink-3 hover:text-ink-2'
                }`}
                title={showDone.has(project.id) ? 'Hide finished work' : 'Show finished work'}
              >
                {doneCount} done {showDone.has(project.id) ? '\u2713' : '\u00b7 show'}
              </button>
            )}
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
                className="rounded-md p-1 text-ink-3 hover:bg-band-nest hover:text-mine disabled:opacity-25"
              >
                <ChevronUpIcon size={12} />
              </button>
              <button
                onClick={() => reorder(groups.map(g => g.project), project.id, 1)}
                disabled={gi === groups.length - 1}
                aria-label={`Move ${project.title} down`}
                title="Move down"
                className="rounded-md p-1 text-ink-3 hover:bg-band-nest hover:text-mine disabled:opacity-25"
              >
                <ChevronDownIcon size={12} />
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
          {departments.map(({ node, rows, hiddenCount }) => (
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
                  className="min-w-0 break-words text-left text-[11.5px] font-semibold leading-tight"
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
                  className="rounded p-0.5 text-ink-3 hover:text-mine"
                >
                  <PencilIcon size={10} />
                </button>
                <span className="text-[9.5px] tnum text-ink-3">{node.childCount}</span>
                {node.link && (
                  <a href={node.link} target="_blank" rel="noopener noreferrer"
                     className="text-mine"><ExternalIcon size={10} /></a>
                )}
              </div>

              {rows.length === 0 ? (
                <p className="pt-0.5 text-[10.5px] text-ink-3">
                  {hiddenCount > 0 ? 'Nothing due in the next two weeks.' : 'Empty.'}
                </p>
              ) : (
                <div className="flex flex-col items-start gap-y-[3px] pt-1">
                  {rows.map(c => (
                    <Chip key={c.id} child={c} parentId={node.id}
                          onAction={t => setActionTarget(t)}
                          onWait={() => setWaitingTarget(c)} />
                  ))}
                </div>
              )}

              {hiddenCount > 0 && (
                <button
                  onClick={() => setOpenedFully(prev => new Set(prev).add(node.id))}
                  className="mt-0.5 block text-[10px] text-mine hover:underline"
                >
                  show all {rows.length + hiddenCount} — {hiddenCount} further out
                </button>
              )}
              {openedFully.has(node.id) && (
                <button
                  onClick={() => setOpenedFully(prev => {
                    const n = new Set(prev); n.delete(node.id); return n
                  })}
                  className="mt-0.5 block text-[10px] text-ink-3 hover:underline"
                >
                  back to two weeks
                </button>
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

/**
 * One half of the week block: a run of days, each its own group.
 *
 * Extracted so this week and next week render identically — the same day
 * header, the same add field, the same sort — rather than one being a copy of
 * the other that drifts.
 */
function WeekHalf({
  days, empty, addTodo, toRows, tree, today, onToggle, onEdit, onChanged,
}: {
  days: [string, { todos: Todo[]; items: { node: TreeNode; when: string; kind: 'planned' | 'due' | 'followup' }[] }][]
  empty: string
  addTodo: (date: string, title: string) => void
  toRows: (todos: Todo[], items: { node: TreeNode; when: string; kind: 'planned' | 'due' | 'followup' }[]) => {
    key: string; todo?: Todo; item?: { node: TreeNode; kind: 'planned' | 'due' | 'followup' }
  }[]
  tree: TreeNode[]
  today: string
  onToggle: (t: Todo) => void
  onEdit: (t: ActionTarget) => void
  onChanged: () => void
}) {
  if (days.length === 0) return <p className="py-1 text-[12px] text-ink-3">{empty}</p>
  return (
    <>
      {days.map(([date, { todos, items }]) => (
        <section key={date} className="mb-2 last:mb-0">
          {/* A day needs to announce itself. A hairline rule and 10px grey
              read as another row, which is why a wall of thirteen
              assignments looked like one undifferentiated list. */}
          <div className="sticky top-0 z-10 -mx-2 mb-0.5 flex items-baseline gap-2
                          border-y border-line bg-surface-2 px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">
              {DAY_NAMES[dayIndex(date)]}
            </span>
            <span className="text-[10.5px] tnum text-ink-2">{mediumLabel(date)}</span>
            <span className="ml-auto rounded-full bg-surface-3 px-1.5 text-[10px] tnum text-ink-2">
              {todos.length + items.length}
            </span>
          </div>
          <AddToDay date={date} onAdd={addTodo} />
          {toRows(todos, items).map(r =>
            r.todo ? (
              <TodoLine key={r.key} todo={r.todo} onToggle={() => onToggle(r.todo!)}
                        tree={tree} today={today} onEdit={onEdit} onChanged={onChanged} />
            ) : (
              <DatedItem key={r.key} node={r.item!.node} kind={r.item!.kind}
                         tree={tree} onOpen={onEdit} />
            ),
          )}
        </section>
      ))}
    </>
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

/**
 * A dated item from the tree, shown in Today or This week.
 *
 * Carries the path it came from, because "Chapter 1: History of the Wheel"
 * means nothing on a dashboard without the class attached, and the whole point
 * of surfacing it here is to see it away from its own project.
 *
 * planned and due are marked differently and deliberately: planned is when you
 * meant to do it, due is when it is owed, and treating them as one thing is
 * exactly what this app spent its life avoiding.
 */
function DatedItem({
  node, kind, tree, onOpen,
}: {
  node: TreeNode
  kind: 'planned' | 'due' | 'followup'
  tree: TreeNode[]
  onOpen: (t: ActionTarget) => void
}) {
  const byId = new Map(tree.map(n => [n.id, n]))
  const parts: string[] = []
  let cursor = node.parent_id
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const p = byId.get(cursor)
    if (!p) break
    parts.unshift(p.title)
    cursor = p.parent_id
  }
  // Deepest ancestor only: "MSE 2034 - Elem of Mat Eng", not the full chain.
  const where = parts[parts.length - 1] ?? ''
  // A follow-up reads as what you do, not what they owe.
  const label = kind === 'followup' && node.followUp
    ? node.followUp.title
    : node.title

  return (
    <div className="flex items-start gap-1.5 border-b border-line/60 py-1 last:border-b-0">
      <span className={`mt-[3px] shrink-0 rounded-sm px-1 text-[8.5px] uppercase tracking-wider ${
        kind === 'due' ? 'bg-dropped-soft text-dropped'
          : kind === 'followup'
            ? (node.followUp?.overdue ? 'bg-dropped-soft text-dropped' : 'bg-theirs-soft text-theirs')
            : 'bg-mine-soft text-mine'
      }`}>
        {kind === 'followup' ? (node.followUp?.overdue ? 'overdue · theirs' : 'follow up') : kind}
      </span>
      <button
        onClick={() => onOpen({
          id: node.id, title: node.title, parent_id: node.parent_id,
          planned_date: node.planned_date, due_date: node.due_date,
          status: node.status, progress: node.progress ?? null,
        })}
        className="min-w-0 flex-1 break-words text-left text-[12.5px] leading-snug"
      >
        {label}
      </button>
      {where && (
        <span className="mt-[3px] max-w-[40%] shrink text-right text-[10px] leading-tight text-ink-3">{where}</span>
      )}
    </div>
  )
}

/** A single field that puts a plain task on one specific day. */
function AddToDay({
  date, onAdd,
}: {
  date: string
  onAdd: (date: string, title: string) => void
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="mb-0.5 text-[10.5px] text-ink-3 hover:text-mine">
        + add to this day
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={text}
      onChange={e => setText(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && text.trim()) { onAdd(date, text); setText(''); setOpen(false) }
        if (e.key === 'Escape') { setText(''); setOpen(false) }
      }}
      onBlur={() => { if (!text.trim()) setOpen(false) }}
      placeholder="Add a task, Enter to save"
      className="mb-1 w-full rounded-sm border border-line bg-surface-2 px-1.5 py-[3px] text-[11.5px]
                 outline-none placeholder:text-ink-3 focus:border-mine"
    />
  )
}

function TodoLine({
  todo, onToggle, showDay, tree = [], today, onEdit, onChanged,
}: {
  todo: Todo; onToggle: () => void; showDay?: boolean
  tree?: TreeNode[]; today?: string
  /** Opens the item behind this task, when there is one. */
  onEdit?: (t: ActionTarget) => void
  /** After a plain todo is renamed, moved or deleted in place. */
  onChanged?: () => void
}) {
  /**
   * A plain todo has no item behind it, so the item editor has nothing to
   * open. It gets its own three fields in place: the name, the day, and
   * delete. That is everything a plain dated task is.
   */
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(todo.title)
  const [draftDate, setDraftDate] = useState(todo.task_date)
  const [busy, setBusy] = useState(false)

  async function savePlain() {
    const title = draftTitle.trim()
    if (!title) return
    setBusy(true)
    try {
      await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, task_date: draftDate }),
      })
      setEditing(false)
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  async function deletePlain() {
    setBusy(true)
    try {
      await fetch(`/api/todos/${todo.id}`, { method: 'DELETE' })
      setEditing(false)
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }
  /**
   * A materialised item carries context a bare todo does not: which class it
   * belongs to, when it is actually due, and — if rollover has walked it
   * forward — that it was meant to be done days ago.
   *
   * That last part is the whole value of rollover being visible. A task
   * quietly moving to today looks like a task that was always for today; the
   * slip is the information.
   */
  const source = todo.source_item_id ? tree.find(n => n.id === todo.source_item_id) : undefined
  const parent = source?.parent_id ? tree.find(n => n.id === source.parent_id) : undefined
  const slipped = todo.origin_date && todo.origin_date < todo.task_date
    ? Math.round(
        (Date.parse(`${todo.task_date}T12:00:00Z`) - Date.parse(`${todo.origin_date}T12:00:00Z`))
        / 86400000)
    : 0
  const dueIn = source?.due_date && today
    ? Math.round(
        (Date.parse(`${source.due_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000)
    : null

  if (editing && !source) {
    return (
      <div className="border-b border-line/60 py-1.5 last:border-b-0">
        <input
          autoFocus
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') savePlain()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="mb-1 w-full rounded-sm border border-line bg-surface-2 px-1.5 py-[3px] text-[12.5px]
                     outline-none focus:border-mine"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draftDate}
            onChange={e => setDraftDate(e.target.value)}
            className="rounded-sm border border-line bg-surface-2 px-1.5 py-[3px] text-[11px] tnum outline-none focus:border-mine"
          />
          <button disabled={busy} onClick={savePlain}
                  className="rounded-md bg-mine px-2 py-[3px] text-[11px] font-medium text-bg">
            Save
          </button>
          <button disabled={busy} onClick={() => setEditing(false)}
                  className="text-[11px] text-ink-3">
            Cancel
          </button>
          <button disabled={busy} onClick={deletePlain}
                  className="ml-auto text-[11px] text-dropped">
            Delete
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-1.5 border-b border-line/60 py-1 last:border-b-0">
      <Check checked={todo.is_complete} onChange={onToggle} label={`Complete ${todo.title}`} />
      <span className={`min-w-0 flex-1 break-words text-[12.5px] leading-snug ${
        todo.is_complete ? 'text-ink-3 line-through' : ''
      }`}>
        {todo.title}
      </span>

      {slipped > 0 && !todo.is_complete && (
        <span className="shrink-0 rounded-sm bg-dropped-soft px-1 text-[8.5px] uppercase tracking-wider text-dropped"
              title={`Was planned for ${mediumLabel(todo.origin_date!)}`}>
          {slipped}d late
        </span>
      )}

      {dueIn !== null && !todo.is_complete && (
        <span className={`shrink-0 text-[9.5px] tnum ${
          dueIn <= 1 ? 'text-dropped' : dueIn <= 3 ? 'text-mine' : 'text-ink-3'
        }`} title={`Due ${mediumLabel(source!.due_date!)}`}>
          due {dueIn < 0 ? `${Math.abs(dueIn)}d ago` : `in ${dueIn}d`}
        </span>
      )}

      {/*
        A task on the day is the same commitment as the item behind it, so it
        opens the same editor. Without this the day view was the one surface
        where you could tick something off but not change it — and it is the
        surface you look at most.
      */}
      <button
        onClick={() => {
          if (source && onEdit) {
            onEdit({
              id: source.id, title: source.title, parent_id: source.parent_id,
              planned_date: source.planned_date, due_date: source.due_date,
              status: source.status, progress: source.progress ?? null,
            })
          } else {
            setDraftTitle(todo.title)
            setDraftDate(todo.task_date)
            setEditing(true)
          }
        }}
        aria-label={`Edit ${todo.title}`}
        title={source ? 'Edit — dates, where it lives, progress' : 'Rename, move, or delete'}
        className="mt-[2px] shrink-0 rounded p-0.5 text-ink-3 opacity-60 hover:text-mine hover:opacity-100"
      >
        <PencilIcon size={11} />
      </button>

      {parent && (
        <span className="mt-[3px] max-w-[40%] shrink text-right text-[10px] leading-tight text-ink-3">
          {parent.title}
        </span>
      )}

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
    status: child.status ?? null, progress: child.progress ?? null,
  }
  const done = child.progress === 'done'
  return (
    <span className="group inline-flex max-w-full items-start gap-1 rounded-lg border border-line/40 bg-surface py-[3px] pl-2 pr-1 shadow-card hover:border-line">
      {/*
        The title used to be a link to the item's own page, which is the one
        thing this dashboard exists to avoid: you came here to see everything
        at once and it sent you somewhere showing one thing. It opens the
        editor in place instead. The pencil is the same action, said out loud,
        because a title that happens to be clickable is not an affordance.
      */}
      {/*
        Wraps. Clamping to one line with an ellipsis made a long title into a
        guessing game — "Chapter 1: History of Helmets from Meso…" tells you
        nothing you can act on. The chip grows to fit; the controls beside it
        stay on the first line.
      */}
      <button
        onClick={() => onAction(target)}
        className={`min-w-0 break-words text-left text-[12px] leading-snug ${
          done ? 'text-ink-3 line-through' : ''
        }`}
      >
        {child.title}
      </button>
      {child.progress === 'in_progress' && (
        <span className="shrink-0 rounded-full bg-mine px-1 text-[8px] uppercase tracking-wider text-bg">
          wip
        </span>
      )}


      {child.waiting && (
        <button onClick={onWait}
                className={`mt-[3px] shrink-0 text-[9.5px] tnum ${
                  child.possession === 'dropped' ? 'text-dropped' : 'text-ink-3'
                }`}>
          {child.waiting.split(' ')[0]}{child.days !== null ? ` ${child.days}d` : ''}
        </button>
      )}

      {child.link && (
        <a href={child.link} target="_blank" rel="noopener noreferrer"
           className="shrink-0 text-mine"><ExternalIcon size={10} /></a>
      )}

      <button
        onClick={() => onAction(target)}
        aria-label={`Edit ${child.title}`}
        title="Edit — what it is, when it is due, where it lives"
        className="shrink-0 rounded-full p-0.5 text-ink-3 opacity-60 hover:text-mine group-hover:opacity-100"
      >
        <PencilIcon size={10} />
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
