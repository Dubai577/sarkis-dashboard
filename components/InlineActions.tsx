'use client'

import { useState } from 'react'
import { Sheet, Button, Field, inputClass } from '@/components/ui/primitives'
import { PossessionGlyph } from '@/components/ui/Possession'
import { today as todayIso } from '@/lib/dates'
import type { Possession } from '@/lib/possession'

/**
 * The actions the hub needs to perform without navigating away.
 *
 * Each one is optimistic where it is obviously safe and reports failure
 * visibly — a silent no-op on a checkbox is indistinguishable from data loss,
 * which is the specific thing that made the old app untrustworthy.
 */

/** Set or clear who an item is waiting on. Stamps waiting_since server-side. */
export function WaitingOnSheet({
  item,
  people,
  open,
  onClose,
  onDone,
}: {
  item: { id: string; title: string; waiting_on: string | null; nudge_after?: number } | null
  people: { id: string; name: string }[]
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nudge, setNudge] = useState<number | ''>('')

  async function set(personId: string | null) {
    if (!item) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waiting_on: personId,
          ...(nudge === '' ? {} : { nudge_after: nudge }),
        }),
      })
      if (!res.ok) throw new Error('That did not save.')
      onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={item?.title}>
      {error && <p className="mb-2 text-[12px] text-dropped">{error}</p>}

      <p className="mb-2 text-[11px] text-ink-3">
        Waiting on someone parks this until they come back. After the nudge window it
        surfaces again as yours.
      </p>

      <div className="mb-3 max-h-64 overflow-y-auto">
        <button
          onClick={() => set(null)}
          disabled={busy}
          className="flex w-full items-center gap-2 border-b border-line/60 py-2 text-left"
        >
          <PossessionGlyph state="mine" size={12} />
          <span className="text-[13px]">No one — it&rsquo;s on me</span>
        </button>
        {people.map(p => (
          <button
            key={p.id}
            onClick={() => set(p.id)}
            disabled={busy}
            className="flex w-full items-center gap-2 border-b border-line/60 py-2 text-left last:border-b-0"
          >
            <PossessionGlyph state="theirs" size={12} />
            <span className="flex-1 text-[13px]">{p.name}</span>
            {item?.waiting_on === p.id && <span className="text-[10px] text-mine">current</span>}
          </button>
        ))}
      </div>

      <Field label="Nudge after (days)">
        <input
          type="number"
          min={1}
          max={365}
          placeholder={String(item?.nudge_after ?? 7)}
          value={nudge}
          onChange={e => setNudge(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputClass}
        />
      </Field>
    </Sheet>
  )
}

/** Add a child to an item without leaving the page. */
export function AddChild({
  parentId,
  categoryId,
  onAdded,
}: {
  parentId: string
  categoryId?: string | null
  onAdded: () => void
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const text = title.trim()
    if (!text) return
    setTitle('')
    setBusy(true)
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text, parent_id: parentId, category_id: categoryId ?? null }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      setError('')
      onAdded()
    } catch (e) {
      setTitle(text)               // never lose typed text
      setError(e instanceof Error ? e.message : 'Could not add that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Add…"
        disabled={busy}
        className="min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12px] outline-none placeholder:text-ink-3 focus:border-mine/60"
      />
      {error && <span className="shrink-0 text-[10px] text-dropped">{error}</span>}
    </div>
  )
}

/** Turn a note into an item, in place. The note is kept. */
export function PromoteNote({
  note,
  roots,
  categories,
  open,
  onClose,
  onDone,
}: {
  note: { id: string; content: string } | null
  roots: { id: string; title: string }[]
  categories: { id: string; name: string }[]
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  const [parent, setParent] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // First line becomes the title; the rest stays as notes.
  const firstLine = (note?.content ?? '').split('\n')[0].trim()
  const rest = (note?.content ?? '').split('\n').slice(1).join('\n').trim()

  async function promote() {
    if (!note) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: (title.trim() || firstLine).slice(0, 500),
          notes: rest || null,
          parent_id: parent || null,
          category_id: category || null,
          planned_date: date || null,
        }),
      })
      if (!res.ok) throw new Error('Could not promote that.')
      onDone()
      onClose()
      setTitle(''); setParent(''); setCategory(''); setDate('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not promote that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Make this an item"
      footer={
        <>
          <Button variant="primary" full onClick={promote} disabled={busy}>
            {busy ? 'Adding…' : 'Add it'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      {error && <p className="mb-2 text-[12px] text-dropped">{error}</p>}

      <div className="space-y-2.5">
        <Field label="Title">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={firstLine}
            className={inputClass}
          />
        </Field>

        {rest && (
          <p className="rounded-sm border border-line bg-surface-2 p-2 text-[11px] leading-snug text-ink-3">
            The rest of the note is kept as its notes.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label="Under">
            <select value={parent} onChange={e => setParent(e.target.value)} className={inputClass}>
              <option value="">Top level</option>
              {roots.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Planned date">
          <input type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)}
                 className={inputClass} />
        </Field>

        <p className="text-[11px] text-ink-3">
          The note stays where it is. Promoting copies it into the tree rather than moving it.
        </p>
      </div>
    </Sheet>
  )
}

export type { Possession }
