'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Field, Sheet, inputClass } from '@/components/ui/primitives'
import { today as todayIso, addDays, mediumLabel } from '@/lib/dates'

interface Option { id: string; name?: string; title?: string }
interface Row { id: string; title: string; parent_id: string | null }

/**
 * Quick capture — the most-used path in the app.
 *
 * One field, focused on open, saves on Enter. Nothing below the text blocks the
 * save, which is the point: the question "is this a project or a task?" asked at
 * the moment of typing is what stopped things being captured at all.
 *
 * But the answer still has to be *available*. The first version offered
 * "Note / Backlog / A day" — "backlog" was jargon left over from the flat list
 * that no longer exists, and the one option someone reaches for deliberately,
 * a new project, was hidden in a dropdown below the row. So the row now names
 * the four things you can actually make, and a project can be given its
 * departments in the same trip instead of one create per department.
 *
 * Typed text is never lost. A failed request leaves the text in the box with
 * the error beside it, so the retry is one tap rather than a retype.
 */

type Kind = 'project' | 'task' | 'todo' | 'note'

const KINDS: ReadonlyArray<readonly [Kind, string, string]> = [
  ['project', 'Project', 'Top level and pinned. Give it departments or tasks below.'],
  ['task', 'Task', 'Lives under a project or a department.'],
  ['todo', 'A day', 'Goes straight onto a date.'],
  ['note', 'Note', 'Unsorted. File it later from the inbox.'],
]

export function Capture({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Kind>('note')
  const [date, setDate] = useState(todayIso())
  const [parentId, setParentId] = useState('')
  const [parentQuery, setParentQuery] = useState('')
  const [childText, setChildText] = useState('')
  const [personId, setPersonId] = useState('')
  const [splitInto, setSplitInto] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [rows, setRows] = useState<Row[]>([])
  const [people, setPeople] = useState<Option[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setSplitInto(null)
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [open])

  // Loaded lazily, and only once — capture must open instantly.
  useEffect(() => {
    if (!open || rows.length > 0) return
    fetch('/api/items')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setRows(d.items ?? []))
      .catch(() => {})
    fetch('/api/people')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setPeople(d.people ?? []))
      .catch(() => {})
  }, [open, rows.length])

  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  /**
   * Parents worth offering: roots, and anything that already holds something.
   * All 156 rows in a native select is not a picker, it is a haystack — so the
   * plausible containers lead, and typing widens the search to everything.
   *
   * Paths are full ("Convent / Buildings") so two departments that share a name
   * are still tellable apart.
   */
  const parents = useMemo(() => {
    const pathOf = (r: Row): string => {
      const parts = [r.title]
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
    }
    const holdsSomething = new Set(rows.map(r => r.parent_id).filter(Boolean) as string[])
    const q = parentQuery.trim().toLowerCase()
    return rows
      .filter(r => (q ? true : !r.parent_id || holdsSomething.has(r.id)))
      .map(r => ({ id: r.id, path: pathOf(r) }))
      .filter(p => !q || p.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 80)
  }, [rows, parentQuery, byId])

  // Newlines or commas — however the list came out of your head.
  const children = useMemo(
    () => childText.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length > 0),
    [childText],
  )

  const commas = text.includes(',') && text.trim().length > 3
  const preview = commas
    ? text.split(/\s*[,;]\s*/).map(s => s.trim()).filter(s => s.length > 1)
    : []

  const hint = KINDS.find(k => k[0] === kind)?.[2] ?? ''

  async function save() {
    const value = text.trim()
    if (!value || busy) return

    setBusy(true)
    setError('')

    try {
      const body: Record<string, unknown> = { text: value }

      if (kind === 'todo') {
        body.target = 'todo'
        body.task_date = date
      } else if (kind === 'note') {
        body.target = 'note'
      } else {
        body.target = 'item'
        if (kind === 'project') body.board = 'pinned'
        if (kind === 'task' && parentId) body.parent_id = parentId
        if (personId) body.waiting_on = personId
      }

      const res = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not save that.')

      // Children only after the parent exists, so a failure here never loses text.
      if (kind === 'project' && children.length > 0 && data.kind === 'item') {
        for (const title of children.slice(0, 40)) {
          await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, parent_id: data.item.id }),
          })
        }
      }

      if (kind === 'task' && splitInto && splitInto.length > 1 && data.kind === 'item') {
        await fetch(`/api/items/${data.item.id}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ children: splitInto }),
        })
      }

      setText('')
      setChildText('')
      setSplitInto(null)
      onSaved?.()
      onClose()
    } catch (e) {
      // Text stays in the box on purpose.
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Capture">
      <div className="space-y-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => { setText(e.target.value); setError('') }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
          }}
          rows={2}
          // No "describe your task" placeholder: titles here are terse and
          // context-free by nature and must not be made to feel wrong.
          placeholder="Anything…"
          className={`${inputClass} resize-none`}
        />

        {error && (
          <p role="alert" className="text-sm text-dropped">
            {error} <span className="text-ink-3">Your text is still here.</span>
          </p>
        )}

        <div>
          <div className="flex gap-1">
            {KINDS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={`flex-1 rounded-md px-1 py-2 text-[11.5px] transition-colors ${
                  kind === value
                    ? 'bg-mine text-bg font-medium'
                    : 'border border-line bg-surface-2 text-ink-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10.5px] leading-snug text-ink-3">{hint}</p>
        </div>

        {kind === 'project' && (
          <Field label="What goes under it (optional)">
            <textarea
              value={childText}
              onChange={e => setChildText(e.target.value)}
              rows={3}
              placeholder={'Buildings\nWebsite\nHymns'}
              className={`${inputClass} resize-none text-[13px] leading-snug`}
            />
            {children.length > 0 && (
              <p className="mt-1 text-[10.5px] leading-snug text-ink-3">
                {children.length} to create under it: {children.slice(0, 6).join(' · ')}
                {children.length > 6 ? ' …' : ''}
              </p>
            )}
          </Field>
        )}

        {kind === 'task' && (
          <div className="space-y-2">
            <Field label="Under">
              <input
                value={parentQuery}
                onChange={e => setParentQuery(e.target.value)}
                placeholder="Search projects and departments…"
                className={`${inputClass} mb-1.5`}
              />
              <select value={parentId} onChange={e => setParentId(e.target.value)} className={inputClass}>
                <option value="">Nowhere yet — sort it later</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>{p.path}</option>
                ))}
              </select>
            </Field>
            <Field label="Waiting on (optional)">
              <select value={personId} onChange={e => setPersonId(e.target.value)} className={inputClass}>
                <option value="">No one — it is on me</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {kind === 'todo' && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              {[0, 1, 2].map(offset => {
                const d = addDays(todayIso(), offset)
                const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : mediumLabel(d)
                return (
                  <button
                    key={offset}
                    onClick={() => setDate(d)}
                    className={`flex-1 rounded-md border py-1.5 text-xs ${
                      date === d ? 'border-mine text-mine' : 'border-line text-ink-2'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
        )}

        {commas && kind === 'task' && (
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-2">
                Looks like {preview.length} things
              </span>
              <button
                onClick={() => setSplitInto(splitInto ? null : preview)}
                className={`text-xs ${splitInto ? 'text-mine' : 'text-ink-3 underline underline-offset-2'}`}
              >
                {splitInto ? 'Will split' : 'Split them'}
              </button>
            </div>
            {splitInto && (
              <ul className="mt-2 space-y-1">
                {splitInto.map((child, i) => (
                  <li key={i} className="text-xs text-ink-2">· {child}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="primary" onClick={save} disabled={!text.trim() || busy} full>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
        </div>

        <p className="text-center text-[11px] text-ink-3">Enter saves · Shift+Enter for a new line</p>
      </div>
    </Sheet>
  )
}
