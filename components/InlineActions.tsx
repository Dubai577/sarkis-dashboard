'use client'

import { useState } from 'react'
import { Sheet, Button, Field, inputClass } from '@/components/ui/primitives'
import { PossessionGlyph } from '@/components/ui/Possession'
import { addDays, dayIndex, today as todayIso } from '@/lib/dates'
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
  /**
   * Collapsed until wanted.
   *
   * A permanent full-width text box under every group is the single biggest
   * consumer of vertical space on a board of twenty groups — it costs a whole
   * row each, forever, to serve a thing you do occasionally. Compact keeps a
   * one-word affordance and becomes the field on click.
   */
  compact = false,
}: {
  parentId: string
  categoryId?: string | null
  onAdded: () => void
  compact?: boolean
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(!compact)

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

  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-0.5 text-[10px] text-ink-3 hover:text-mine"
      >
        + add
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'pt-1' : 'py-1'}`}>
      <input
        autoFocus={compact}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape' && compact) { setTitle(''); setOpen(false) }
        }}
        onBlur={() => { if (compact && !title.trim()) setOpen(false) }}
        placeholder="Add…"
        disabled={busy}
        className={`min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-1.5 outline-none placeholder:text-ink-3 focus:border-mine/60 ${
          compact ? 'py-[3px] text-[11px]' : 'py-1 text-[12px]'
        }`}
      />
      {error && <span className="shrink-0 text-[10px] text-dropped">{error}</span>}
    </div>
  )
}

/**
 * Give an item a date, or say it does not need one.
 *
 * "Ongoing" exists because undated is two different things: something you have
 * not scheduled yet, and something that genuinely runs continuously. Without
 * the distinction every long-running project sits in the same pile as things
 * you have forgotten to plan, and that pile stops being worth reading.
 */
export function QuickDate({
  item,
  onDone,
}: {
  item: { id: string; planned_date: string | null; status: string | null }
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function set(body: Record<string, unknown>) {
    setBusy(true)
    try {
      await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      onDone()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const ongoing = item.status === 'Ongoing'

  if (!open) {
    return (
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={`shrink-0 rounded-sm border px-1.5 py-px text-[10px] ${
          ongoing ? 'border-theirs/40 text-theirs' : 'border-line text-ink-3'
        }`}
      >
        {ongoing ? 'ongoing' : '+ date'}
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-1" onClick={e => e.stopPropagation()}>
      {([['Today', todayIso()], ['Tue', nextWeekday(2)], ['+1w', addDays(todayIso(), 7)]] as const).map(
        ([label, date]) => (
          <button key={label} disabled={busy}
                  onClick={() => set({ planned_date: date, status: null })}
                  className="rounded-sm border border-line px-1 py-px text-[10px] text-ink-2">
            {label}
          </button>
        ),
      )}
      <input
        type="date"
        disabled={busy}
        defaultValue={item.planned_date ?? ''}
        onChange={e => e.target.value && set({ planned_date: e.target.value, status: null })}
        className="w-[104px] rounded-sm border border-line bg-surface-2 px-1 py-px text-[10px]"
      />
      <button disabled={busy}
              onClick={() => set({ status: ongoing ? null : 'Ongoing', planned_date: null })}
              className={`rounded-sm border px-1 py-px text-[10px] ${
                ongoing ? 'border-theirs text-theirs' : 'border-line text-ink-3'
              }`}>
        ongoing
      </button>
      <button onClick={() => setOpen(false)} className="px-1 text-[10px] text-ink-3">×</button>
    </span>
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

/** The next occurrence of a weekday — 0 = Monday. Today counts as next. */
function nextWeekday(target: number): string {
  const start = todayIso()
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(start, i)
    if (dayIndex(candidate) === target) return candidate
  }
  return start
}

export type { Possession }
