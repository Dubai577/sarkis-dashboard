'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, Field, Sheet, inputClass } from '@/components/ui/primitives'
import { today as todayIso, addDays, mediumLabel } from '@/lib/dates'

interface Option { id: string; name?: string; title?: string }

/**
 * Quick capture — the most-used path in the app.
 *
 * One field, focused on open, saves on Enter. It never asks whether the thing
 * is a project or a task: that question at the moment of typing is exactly what
 * stopped things being captured, which is why 5 projects exist in the app
 * against 15+ in real life.
 *
 * Everything else — a date, a person, a parent, a split — is offered after the
 * text exists, and none of it blocks saving.
 *
 * Typed text is never lost. A failed request leaves the text in the box with
 * the error beside it, so the retry is one tap rather than a retype.
 */
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
  const [target, setTarget] = useState<'note' | 'item' | 'todo'>('note')
  const [date, setDate] = useState(todayIso())
  const [parentId, setParentId] = useState('')
  const [personId, setPersonId] = useState('')
  const [splitInto, setSplitInto] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [parents, setParents] = useState<Option[]>([])
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
    if (!open || parents.length > 0) return
    fetch('/api/items?view=board')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setParents([...(d.projects ?? []), ...(d.areas ?? [])]))
      .catch(() => {})
    fetch('/api/people')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setPeople(d.people ?? []))
      .catch(() => {})
  }, [open, parents.length])

  const commas = text.includes(',') && text.trim().length > 3
  const preview = commas
    ? text.split(/\s*[,;]\s*/).map(s => s.trim()).filter(s => s.length > 1)
    : []

  async function save() {
    const value = text.trim()
    if (!value || busy) return

    setBusy(true)
    setError('')

    try {
      const body: Record<string, unknown> = { text: value, target }
      if (target === 'todo') body.task_date = date
      if (target === 'item') {
        if (parentId) body.parent_id = parentId
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

      // Split only after the record exists, so a failure here never loses text.
      if (splitInto && splitInto.length > 1 && data.kind === 'item') {
        await fetch(`/api/items/${data.item.id}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ children: splitInto }),
        })
      }

      setText('')
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
          rows={3}
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

        <div className="flex gap-1.5">
          {([
            ['note', 'Note'],
            ['item', 'Backlog'],
            ['todo', 'A day'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTarget(value)}
              className={`flex-1 rounded-md py-2 text-sm transition-colors ${
                target === value
                  ? 'bg-mine text-bg font-medium'
                  : 'bg-surface-2 text-ink-2 border border-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {target === 'todo' && (
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

        {target === 'item' && (
          <div className="space-y-2">
            <Field label="Under (optional)">
              <select value={parentId} onChange={e => setParentId(e.target.value)} className={inputClass}>
                <option value="">Nothing — a new project</option>
                {parents.map(p => (
                  <option key={p.id} value={p.id}>{p.title ?? p.name}</option>
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

        {commas && target === 'item' && (
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
