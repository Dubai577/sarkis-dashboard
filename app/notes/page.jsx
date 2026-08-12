'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Button, EmptyState, ErrorBanner, Field, Sheet, Spinner, inputClass,
} from '@/components/ui/primitives'
import { addDays, mediumLabel, today as todayIso } from '@/lib/dates'

/**
 * Notes as a board, not a chronological wall.
 *
 * This is the inbox: things get dumped here fast and filed later. Masonry
 * columns because the content is genuinely mixed — a two-word note and a
 * nine-line brain dump have to sit together without either dominating.
 *
 * There are deliberately no tags, colours or folders. The board's success
 * condition is emptying; anything that makes notes pleasant to organise in
 * place would rebuild the pinned WhatsApp thread this replaced.
 */

/** Dates that appear in real notes: "nov 19-20", "July 2nd 3pm", "June 16th". */
const DATE_HINT =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|\b\d{1,2}\/\d{1,2}\b/i

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401) { window.location.href = '/login?next=/notes'; throw new Error('Session expired.') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed.')
  return data
}

export default function NotesPage() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null)
  const [promoting, setPromoting] = useState(null)

  const load = useCallback(async () => {
    try {
      const { notes } = await api('/api/notes')
      setNotes(notes)
      setError('')
    } catch (e) {
      setError(e.message)
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

  async function add() {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    try {
      const { note } = await api('/api/notes', { method: 'POST', body: JSON.stringify({ content }) })
      setNotes([note, ...notes])
    } catch (e) {
      setDraft(content)
      setError(e.message)
    }
  }

  async function saveEdit() {
    if (!editing) return
    try {
      const { note } = await api(`/api/notes/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editing.content }),
      })
      setNotes(notes.map(n => (n.id === note.id ? note : n)))
      setEditing(null)
    } catch (e) {
      setError(e.message)
    }
  }

  async function remove(id) {
    setNotes(notes.filter(n => n.id !== id))
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' })
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  if (loading) return <Spinner label="Loading notes" />

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <p className="text-sm text-ink-2">{notes.length} waiting to be filed</p>
      </header>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      <div className="mb-5 flex gap-1.5">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add() } }}
          rows={2}
          placeholder="Anything…"
          className={`${inputClass} resize-none`}
        />
        <Button variant="primary" onClick={add} disabled={!draft.trim()}>Add</Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title="Nothing in the inbox."
          hint="This is where things land before they have a home. Empty is the goal, not a problem."
        />
      ) : (
        <div className="columns-1 gap-2 sm:columns-2 lg:columns-3">
          {notes.map(note => {
            const lines = note.content.split('\n').map(l => l.trim()).filter(Boolean)
            const hasDate = DATE_HINT.test(note.content)
            return (
              <article
                key={note.id}
                className={`mb-2 break-inside-avoid rounded-lg border bg-surface p-3 ${
                  hasDate ? 'border-mine/30' : 'border-line'
                }`}
              >
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                  {note.content}
                </p>

                <div className="mt-2.5 flex items-center gap-2 text-[10px] text-ink-3">
                  {hasDate && <span className="text-mine">has a date</span>}
                  {lines.length > 1 && <span>{lines.length} lines</span>}
                  <span className="ml-auto flex gap-2">
                    <button onClick={() => setPromoting(note)} className="text-mine">File</button>
                    <button onClick={() => setEditing({ ...note })}>Edit</button>
                    <button onClick={() => remove(note.id)} className="hover:text-dropped">Delete</button>
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title="Edit note"
             footer={<Button variant="primary" onClick={saveEdit} full>Save</Button>}>
        {editing && (
          <textarea
            value={editing.content}
            onChange={e => setEditing({ ...editing, content: e.target.value })}
            rows={8}
            className={`${inputClass} resize-none`}
          />
        )}
      </Sheet>

      <PromoteSheet
        note={promoting}
        onClose={() => setPromoting(null)}
        onDone={() => { setPromoting(null); load() }}
        onError={setError}
      />
    </div>
  )
}

/**
 * Filing a note. The note is kept either way — promotion is not destruction,
 * so filing something wrongly costs nothing and the inbox stays fast to use.
 */
function PromoteSheet({ note, onClose, onDone, onError }) {
  const [target, setTarget] = useState('item')
  const [titles, setTitles] = useState([])
  const [parentId, setParentId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [parents, setParents] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!note) return
    const lines = note.content.split('\n').map(l => l.trim()).filter(Boolean)
    setTitles(lines.length > 1 ? lines : [note.content.trim()])
    setTarget('item')
    setParentId('')
  }, [note])

  useEffect(() => {
    if (!note || parents.length) return
    fetch('/api/items?view=board')
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setParents([...(d.projects ?? []), ...(d.areas ?? [])]))
      .catch(() => {})
  }, [note, parents.length])

  async function commit() {
    if (!note || busy) return
    setBusy(true)
    try {
      const body = { target, titles }
      if (target === 'todo') body.task_date = date
      else if (parentId) body.parent_id = parentId

      const res = await fetch(`/api/notes/${note.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Could not file that.')
      }
      onDone()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={!!note}
      onClose={onClose}
      title="File this note"
      footer={
        <>
          <Button variant="primary" onClick={commit} disabled={busy || titles.length === 0} full>
            {busy ? 'Filing…' : `File ${titles.length > 1 ? `${titles.length} items` : 'it'}`}
          </Button>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {[['item', 'Backlog'], ['todo', 'A day']].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTarget(value)}
              className={`flex-1 rounded-md py-2 text-sm ${
                target === value ? 'bg-mine text-bg font-medium' : 'border border-line bg-surface-2 text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {titles.length > 1 && (
          <p className="text-xs text-ink-3">
            {titles.length} lines — each becomes its own item. Remove any that should not.
          </p>
        )}

        <div className="space-y-1.5">
          {titles.map((title, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                value={title}
                onChange={e => {
                  const next = [...titles]
                  next[i] = e.target.value
                  setTitles(next)
                }}
                className={inputClass}
              />
              {titles.length > 1 && (
                <button
                  onClick={() => setTitles(titles.filter((_, j) => j !== i))}
                  className="px-2 text-ink-3 hover:text-dropped"
                  aria-label="Remove line"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {target === 'item' ? (
          <Field label="Under (optional)">
            <select value={parentId} onChange={e => setParentId(e.target.value)} className={inputClass}>
              <option value="">Nothing — a new project</option>
              {parents.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        ) : (
          <>
            <div className="flex gap-1.5">
              {[0, 1, 7].map(offset => {
                const d = addDays(todayIso(), offset)
                return (
                  <button
                    key={offset}
                    onClick={() => setDate(d)}
                    className={`flex-1 rounded-md border py-1.5 text-xs ${
                      date === d ? 'border-mine text-mine' : 'border-line text-ink-2'
                    }`}
                  >
                    {offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : mediumLabel(d)}
                  </button>
                )
              })}
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </>
        )}

        <p className="text-[11px] text-ink-3">The note stays here either way.</p>
      </div>
    </Sheet>
  )
}
