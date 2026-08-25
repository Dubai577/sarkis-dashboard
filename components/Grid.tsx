'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * The grid — everything, at once, editable where it sits.
 *
 * The rest of the app asks you to open something before you can change it: tap
 * a row, wait for a sheet, change one field, close it, find your place again.
 * That is fine for one edit and hopeless for fifty, which is why a spreadsheet
 * still beat this app at the job it exists to do.
 *
 * So: no sheets. Every cell is the control. Typing saves, a dropdown saves,
 * a date saves. Nothing asks for confirmation and nothing navigates away.
 *
 * Writes are optimistic — the cell shows the new value immediately and the
 * request follows. A failed write puts the old value back and marks the row,
 * because silently keeping a value the server rejected is the one behaviour
 * that would make this untrustworthy.
 */

interface Row {
  id: string
  parent_id: string | null
  title: string
  priority: string | null
  status: string | null
  planned_date: string | null
  due_date: string | null
  waiting_on: string | null
  child_count: number
  is_group_view?: boolean
  possession: 'mine' | 'theirs' | 'dropped'
  category: { color: string | null } | null
}

interface Person { id: string; name: string }

const PRIORITIES = ['Urgent', 'Soon', 'Whenever'] as const

type SortKey = 'tree' | 'title' | 'priority' | 'planned_date' | 'due_date' | 'under'

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, Soon: 1, Whenever: 2 }

/** Blank dates sort last in both directions — an empty cell is not "earliest". */
function compare(a: Row, b: Row, key: SortKey, pathOf: (r: Row) => string): number {
  if (key === 'title') return a.title.localeCompare(b.title)
  if (key === 'under') return pathOf(a).localeCompare(pathOf(b))
  if (key === 'priority') {
    return (PRIORITY_RANK[a.priority ?? ''] ?? 9) - (PRIORITY_RANK[b.priority ?? ''] ?? 9)
  }
  const av = a[key as 'planned_date' | 'due_date']
  const bv = b[key as 'planned_date' | 'due_date']
  if (!av && !bv) return 0
  if (!av) return 1
  if (!bv) return -1
  return av.localeCompare(bv)
}

export function Grid() {
  const [rows, setRows] = useState<Row[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('tree')
  const [desc, setDesc] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(0)
  const [newTitle, setNewTitle] = useState('')
  const [newParent, setNewParent] = useState('')

  const titleRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const load = useCallback(async () => {
    const [i, p] = await Promise.all([
      fetch('/api/items').then(r => (r.ok ? r.json() : { items: [] })),
      fetch('/api/people').then(r => (r.ok ? r.json() : { people: [] })),
    ])
    setRows(i.items ?? [])
    setPeople(p.people ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  const pathOf = useCallback((r: Row): string => {
    const parts: string[] = []
    let cursor = r.parent_id
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor)
      const p = byId.get(cursor)
      if (!p) break
      parts.unshift(p.title)
      cursor = p.parent_id
    }
    return parts.join(' / ')
  }, [byId])

  const depthOf = useCallback((r: Row): number => {
    let d = 0
    let cursor = r.parent_id
    const guard = new Set<string>()
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor)
      d++
      cursor = byId.get(cursor)?.parent_id ?? null
    }
    return d
  }, [byId])

  /** Anything that can hold something — the move targets. */
  const groups = useMemo(
    () => rows
      .filter(r => r.is_group_view || r.child_count > 0 || !r.parent_id)
      .map(r => ({ id: r.id, label: [pathOf(r), r.title].filter(Boolean).join(' / ') }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [rows, pathOf],
  )

  /**
   * Default order is the tree, depth-first, so a project and its departments
   * stay together. Any column header switches to a flat sort of the same rows —
   * indentation is kept so you can still see what sits under what.
   */
  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (r: Row) =>
      !q || r.title.toLowerCase().includes(q) || pathOf(r).toLowerCase().includes(q)

    if (sort !== 'tree') {
      const flat = rows.filter(matches).sort((a, b) => compare(a, b, sort, pathOf))
      return desc ? flat.reverse() : flat
    }

    const kids = new Map<string, Row[]>()
    for (const r of rows) {
      const key = r.parent_id ?? ''
      const list = kids.get(key) ?? []
      list.push(r)
      kids.set(key, list)
    }
    for (const [, list] of kids) list.sort((a, b) => a.title.localeCompare(b.title))

    const out: Row[] = []
    const walk = (parent: string, guard: Set<string>) => {
      for (const r of kids.get(parent) ?? []) {
        if (guard.has(r.id)) continue
        guard.add(r.id)
        out.push(r)
        walk(r.id, guard)
      }
    }
    walk('', new Set())

    // A filter must not hide a match just because its parent did not match.
    if (!q) return out
    const keep = new Set<string>()
    for (const r of rows) {
      if (!matches(r)) continue
      keep.add(r.id)
      let cursor = r.parent_id
      const guard = new Set<string>()
      while (cursor && !guard.has(cursor)) {
        guard.add(cursor)
        keep.add(cursor)
        cursor = byId.get(cursor)?.parent_id ?? null
      }
    }
    return out.filter(r => keep.has(r.id))
  }, [rows, sort, desc, query, pathOf, byId])

  /** Optimistic write. The row changes now; the request catches up. */
  const patch = useCallback(async (id: string, body: Record<string, unknown>) => {
    const before = rows.find(r => r.id === id)
    if (!before) return
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...body } as Row : r)))
    setFailed(prev => { const n = new Set(prev); n.delete(id); return n })
    setSaving(s => s + 1)
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('rejected')
      // parent_id changes reshape the tree, so counts have to come back fresh.
      if ('parent_id' in body) load()
    } catch {
      setRows(prev => prev.map(r => (r.id === id ? before : r)))
      setFailed(prev => new Set(prev).add(id))
    } finally {
      setSaving(s => s - 1)
    }
  }, [rows, load])

  /** Typing should not fire a request per keystroke. */
  const patchTitleSoon = useCallback((id: string, title: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, title } : r)))
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => {
      if (title.trim()) patch(id, { title: title.trim() })
    }, 600)
  }, [patch])

  async function addRow() {
    const title = newTitle.trim()
    if (!title) return
    setSaving(s => s + 1)
    try {
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: newParent || null }),
      })
      setNewTitle('')
      await load()
    } finally {
      setSaving(s => s - 1)
    }
  }

  async function bulk(body: Record<string, unknown>) {
    const ids = [...selected]
    setSaving(s => s + 1)
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })))
      setSelected(new Set())
      await load()
    } finally {
      setSaving(s => s - 1)
    }
  }

  async function bulkArchive() {
    const ids = [...selected]
    setSaving(s => s + 1)
    try {
      await Promise.all(ids.map(id => fetch(`/api/items/${id}`, { method: 'DELETE' })))
      setSelected(new Set())
      await load()
    } finally {
      setSaving(s => s - 1)
    }
  }

  /** Enter and the arrows walk the column, the way a sheet does. */
  function moveFocus(index: number, delta: number) {
    const next = ordered[index + delta]
    if (next) titleRefs.current[next.id]?.focus()
  }

  const header = (key: SortKey, label: string, className = '') => (
    <th
      className={`sticky top-0 z-10 border-b border-line bg-surface px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-ink-3 ${className}`}
    >
      <button
        onClick={() => { setDesc(sort === key ? !desc : false); setSort(key) }}
        className={sort === key ? 'text-ink' : ''}
      >
        {label}{sort === key ? (desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )

  const cell = 'border-b border-line/50 px-1 py-0.5 align-middle'
  const field =
    'w-full rounded-[3px] border border-transparent bg-transparent px-1 py-[3px] text-[12px] ' +
    'hover:border-line focus:border-mine focus:bg-surface focus:outline-none'

  if (loading) return <p className="p-4 text-[12px] text-ink-3">Loading everything…</p>

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col md:h-[100dvh]">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter…"
          className="w-44 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] focus:border-mine focus:outline-none"
        />
        <span className="text-[11px] tnum text-ink-3">
          {ordered.length} of {rows.length}
        </span>
        {sort !== 'tree' && (
          <button onClick={() => setSort('tree')} className="text-[11px] text-mine">
            back to tree order
          </button>
        )}
        <span className="ml-auto text-[11px] text-ink-3">
          {saving > 0 ? 'saving…' : failed.size > 0 ? `${failed.size} did not save` : 'saved'}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[880px] border-collapse text-[12px]">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 w-7 border-b border-line bg-surface" />
              {header('title', 'Name', 'min-w-[220px]')}
              {header('under', 'Under', 'w-[150px]')}
              {header('priority', 'Urgency', 'w-[92px]')}
              {header('planned_date', 'Planned', 'w-[126px]')}
              {header('due_date', 'Due', 'w-[126px]')}
              <th className="sticky top-0 z-10 w-[112px] border-b border-line bg-surface px-1.5 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-ink-3">
                Waiting on
              </th>
              <th className="sticky top-0 z-10 w-8 border-b border-line bg-surface" />
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, index) => {
              const isGroup = r.is_group_view || r.child_count > 0
              return (
                <tr
                  key={r.id}
                  className={`${selected.has(r.id) ? 'bg-mine-soft' : ''} ${
                    failed.has(r.id) ? 'bg-dropped-soft' : ''
                  }`}
                >
                  <td className={`${cell} text-center`}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => setSelected(prev => {
                        const n = new Set(prev)
                        n.has(r.id) ? n.delete(r.id) : n.add(r.id)
                        return n
                      })}
                      className="h-3 w-3 accent-[var(--mine)]"
                    />
                  </td>

                  <td className={cell}>
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingLeft: `${Math.min(depthOf(r), 4) * 12}px` }}
                    >
                      <span
                        className="h-3 w-[2px] shrink-0 rounded-full"
                        style={{ background: r.category?.color ?? 'var(--border-2)' }}
                      />
                      <input
                        ref={el => { titleRefs.current[r.id] = el }}
                        value={r.title}
                        onChange={e => patchTitleSoon(r.id, e.target.value)}
                        onBlur={e => {
                          clearTimeout(timers.current[r.id])
                          const v = e.target.value.trim()
                          if (v) patch(r.id, { title: v })
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); moveFocus(index, 1) }
                          if (e.key === 'ArrowDown' && e.metaKey) moveFocus(index, 1)
                          if (e.key === 'ArrowUp' && e.metaKey) moveFocus(index, -1)
                        }}
                        className={`${field} ${isGroup ? 'font-medium' : ''}`}
                      />
                      {isGroup && (
                        <span className="shrink-0 text-[9px] tnum text-ink-3">{r.child_count}</span>
                      )}
                      {r.possession === 'dropped' && (
                        <span className="shrink-0 text-[9px] text-dropped">!</span>
                      )}
                    </div>
                  </td>

                  <td className={cell}>
                    <select
                      value={r.parent_id ?? ''}
                      onChange={e => patch(r.id, { parent_id: e.target.value || null })}
                      className={field}
                    >
                      <option value="">— top level —</option>
                      {groups.filter(g => g.id !== r.id).map(g => (
                        <option key={g.id} value={g.id}>{g.label}</option>
                      ))}
                    </select>
                  </td>

                  <td className={cell}>
                    <select
                      value={r.priority ?? ''}
                      onChange={e => patch(r.id, { priority: e.target.value || null })}
                      className={`${field} ${
                        r.priority === 'Urgent' ? 'text-dropped' : ''
                      }`}
                    >
                      <option value="">—</option>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>

                  <td className={cell}>
                    <input
                      type="date"
                      value={r.planned_date ?? ''}
                      onChange={e => patch(r.id, { planned_date: e.target.value || null })}
                      className={`${field} tnum`}
                    />
                  </td>

                  <td className={cell}>
                    <input
                      type="date"
                      value={r.due_date ?? ''}
                      onChange={e => patch(r.id, { due_date: e.target.value || null })}
                      className={`${field} tnum`}
                    />
                  </td>

                  <td className={cell}>
                    <select
                      value={r.waiting_on ?? ''}
                      onChange={e => patch(r.id, {
                        waiting_on: e.target.value || null,
                        waiting_since: e.target.value ? new Date().toISOString().slice(0, 10) : null,
                      })}
                      className={`${field} ${r.possession === 'dropped' ? 'text-dropped' : ''}`}
                    >
                      <option value="">—</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>

                  <td className={`${cell} text-center`}>
                    <button
                      onClick={async () => {
                        await fetch(`/api/items/${r.id}`, { method: 'DELETE' })
                        load()
                      }}
                      title="Archive"
                      className="text-[11px] text-ink-3 hover:text-dropped"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* The always-there empty row, so adding is typing, not a dialog. */}
            <tr>
              <td className={cell} />
              <td className={cell}>
                <input
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addRow() }}
                  placeholder="New row — type and press Enter"
                  className={field}
                />
              </td>
              <td className={cell}>
                <select
                  value={newParent}
                  onChange={e => setNewParent(e.target.value)}
                  className={field}
                >
                  <option value="">— top level —</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </td>
              <td className={cell} colSpan={5} />
            </tr>
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface px-3 py-2">
          <span className="text-[12px] tnum text-ink-2">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-[11px] text-ink-3">
            clear
          </button>
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) bulk({ parent_id: e.target.value || null }) }}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px]"
          >
            <option value="">Move under…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <select
            defaultValue=""
            onChange={e => { if (e.target.value) bulk({ priority: e.target.value }) }}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px]"
          >
            <option value="">Urgency…</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            onClick={bulkArchive}
            className="ml-auto rounded-md border border-dropped/50 px-2 py-1 text-[11.5px] text-dropped"
          >
            Archive
          </button>
        </div>
      )}
    </div>
  )
}
