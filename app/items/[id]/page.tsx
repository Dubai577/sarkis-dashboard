'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ItemRow } from '@/components/rows'
import { PossessionGlyph } from '@/components/ui/Possession'
import {
  Button, Check, EmptyState, ErrorBanner, Field, Sheet, Spinner, inputClass,
} from '@/components/ui/primitives'
import { POSSESSION_LABEL, daysUntilNudge, type Possession } from '@/lib/possession'
import { mediumLabel, today as todayIso } from '@/lib/dates'

interface Item {
  id: string
  parent_id: string | null
  title: string
  notes: string | null
  category_id: string | null
  planned_date: string | null
  due_date: string | null
  board: 'auto' | 'pinned' | 'muted'
  link: string | null
  archived_at: string | null
  waiting_on: string | null
  waiting_since: string | null
  nudge_after: number
  possession: Possession
  child_count: number
  open_child_count: number
  blocked_child_count: number
  category: { id: string; name: string; color: string } | null
  waiting_person: { id: string; name: string } | null
  people: { id: string; name: string; relation: string }[]
}

interface Payload {
  item: Item
  children: Item[]
  ancestors: Item[]
  split: { parent: string; children: string[] }
}

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [data, setData] = useState<Payload | null>(null)
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [newChild, setNewChild] = useState('')
  const [editing, setEditing] = useState(false)
  const [waitOpen, setWaitOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitChildren, setSplitChildren] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${id}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      if (res.status === 404) { setError('That item no longer exists.'); setLoading(false); return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load this item.')
      setData(body)
      setSplitChildren(body.split?.children ?? [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this item.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/people').then(r => r.ok ? r.json() : null).then(d => d && setPeople(d.people)).catch(() => {})
    fetch('/api/categories').then(r => r.ok ? r.json() : null).then(d => d && setCategories(d.categories)).catch(() => {})
  }, [])

  async function patch(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'That did not save.')
      await load()
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.')
    }
  }

  async function addChild() {
    const title = newChild.trim()
    if (!title) return
    setNewChild('')
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parent_id: id, category_id: data?.item.category_id }),
      })
      if (!res.ok) throw new Error('Could not add that.')
      await load()
    } catch (e) {
      setNewChild(title)   // never lose typed text
      setError(e instanceof Error ? e.message : 'Could not add that.')
    }
  }

  async function archive(target: string) {
    await fetch(`/api/items/${target}`, { method: 'DELETE' })
    if (target === id) router.push('/projects')
    else load()
  }

  async function commitSplit() {
    try {
      const res = await fetch(`/api/items/${id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_title: data?.split.parent, children: splitChildren }),
      })
      if (!res.ok) throw new Error('Could not split that.')
      setSplitOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not split that.')
    }
  }

  if (loading) return <Spinner label="Loading" />
  if (!data) return <div className="p-4"><ErrorBanner message={error || 'Not found.'} /></div>

  const { item, children, ancestors } = data
  const countdown = item.waiting_person ? daysUntilNudge(item) : null
  const canSplit = data.split.children.length > 1

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-ink-3">
        <Link href="/projects" className="hover:text-ink-2">Projects</Link>
        {ancestors.map(a => (
          <span key={a.id} className="flex items-center gap-1.5">
            <span>/</span>
            <Link href={`/items/${a.id}`} className="clamp-1 max-w-[10rem] hover:text-ink-2">{a.title}</Link>
          </span>
        ))}
      </nav>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      <header className="mb-5">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-1.5 h-5 w-[3px] shrink-0 rounded-full"
            style={{ background: item.category?.color ?? 'var(--border-2)' }}
          />
          {/* Full text, wrapping. The longest item here is 473 characters and
              must render as a paragraph rather than being cut off. */}
          <h1 className="flex-1 text-xl font-semibold leading-snug">{item.title}</h1>
          <PossessionGlyph state={item.possession} size={16} className="mt-1.5" />
        </div>

        {item.archived_at && (
          <p className="mt-2 rounded-sm border border-line bg-surface-2 px-2 py-1 text-[11px] text-ink-3">
            Archived {mediumLabel(item.archived_at.slice(0, 10))}. Unarchiving brings its
            children back too.
          </p>
        )}

        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-1.5 text-[12px] text-mine underline underline-offset-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" aria-hidden="true">
              <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" strokeLinecap="round" />
              <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" strokeLinecap="round" />
            </svg>
            <span className="clamp-1">{item.link.replace(/^https?:\/\//, '')}</span>
          </a>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
          {item.category && <span>{item.category.name}</span>}
          {item.child_count > 0 && <span>· {item.open_child_count} open</span>}
          {item.due_date && <span>· due {mediumLabel(item.due_date)}</span>}
          {item.planned_date && <span>· planned {mediumLabel(item.planned_date)}</span>}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button variant="quiet" onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="quiet" onClick={() => setWaitOpen(true)}>
            {item.waiting_person ? 'Waiting on…' : 'Wait on someone'}
          </Button>
          {canSplit && (
            <Button variant="quiet" onClick={() => setSplitOpen(true)}>
              Split into {data.split.children.length}
            </Button>
          )}
          {item.archived_at ? (
            <Button variant="primary" onClick={() => patch({ archived: false })}>Unarchive</Button>
          ) : (
            <Button variant="danger" onClick={() => archive(item.id)}>Archive</Button>
          )}
        </div>
      </header>

      {/* Possession panel */}
      {item.waiting_person && (
        <section
          className={`mb-5 rounded-lg border p-3 ${
            item.possession === 'dropped'
              ? 'border-dropped/40 bg-dropped-soft'
              : 'border-line bg-surface'
          }`}
        >
          <div className="flex items-center gap-2">
            <PossessionGlyph state={item.possession} size={13} />
            <span className="text-sm">
              {POSSESSION_LABEL[item.possession]} · {item.waiting_person.name}
            </span>
            <span className="ml-auto text-[11px] tnum text-ink-3">
              {countdown !== null && countdown >= 0
                ? `${countdown}d left`
                : `${Math.abs(countdown ?? 0)}d over`}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Link href={`/people/${item.waiting_person.id}`}>
              <Button variant="quiet">See everything with them</Button>
            </Link>
            <Button variant="quiet" onClick={() => patch({ waiting_since: todayIso() })}>
              Nudged today
            </Button>
            <Button variant="ghost" onClick={() => patch({ waiting_on: null })}>
              Back on me
            </Button>
          </div>
        </section>
      )}

      {item.notes && (
        <section className="mb-5 whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed text-ink-2">
          {item.notes}
        </section>
      )}

      {/* Children */}
      <section className="mb-5">
        <div className="mb-2 flex items-baseline gap-2 px-1">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
            {children.length > 0 ? 'Parts' : 'Nothing under this yet'}
          </h2>
          {children.length > 0 && (
            <span className="text-[11px] tnum text-ink-3">{children.length}</span>
          )}
        </div>

        <div className="space-y-1.5">
          {children.map(child => (
            <div key={child.id} className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0">
                <ItemRow item={child} href={`/items/${child.id}`} />
              </div>
              <button
                onClick={() => archive(child.id)}
                aria-label={`Archive ${child.title}`}
                className="shrink-0 px-2 py-2 text-ink-3 hover:text-dropped"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* One tap to add a child — this is how something becomes a project. */}
        <div className="mt-2 flex gap-1.5">
          <input
            value={newChild}
            onChange={e => setNewChild(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addChild()}
            placeholder="Add a part…"
            className={inputClass}
          />
          <Button variant="primary" onClick={addChild} disabled={!newChild.trim()}>Add</Button>
        </div>

        {children.length === 0 && (
          <p className="mt-2 px-1 text-[11px] text-ink-3">
            Adding a part makes this a project. Nothing needs re-filing.
          </p>
        )}
      </section>

      {item.people.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-ink-2">People</h2>
          <div className="flex flex-wrap gap-1.5">
            {item.people.map(p => (
              <Link
                key={p.id + p.relation}
                href={`/people/${p.id}`}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs"
              >
                {p.name}
                <span className="ml-1.5 text-ink-3">{p.relation}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Edit */}
      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit">
        <EditForm
          item={item}
          categories={categories}
          onSave={async body => { await patch(body); setEditing(false) }}
        />
      </Sheet>

      {/* Waiting on */}
      <Sheet open={waitOpen} onClose={() => setWaitOpen(false)} title="Waiting on">
        <div className="space-y-3">
          <Field label="Person">
            <select
              defaultValue={item.waiting_on ?? ''}
              onChange={async e => {
                await patch({ waiting_on: e.target.value || null })
                setWaitOpen(false)
              }}
              className={inputClass}
            >
              <option value="">No one — it is on me</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Nudge me after (days)">
            <input
              type="number"
              min={1}
              max={365}
              defaultValue={item.nudge_after}
              onBlur={e => patch({ nudge_after: Number(e.target.value) || 7 })}
              className={inputClass}
            />
          </Field>
          <p className="text-[11px] leading-relaxed text-ink-3">
            After this many days it moves to “needs a nudge” on its own. You never
            have to mark it — forgetting is the thing being caught.
          </p>
        </div>
      </Sheet>

      {/* Split */}
      <Sheet
        open={splitOpen}
        onClose={() => setSplitOpen(false)}
        title="Split into parts"
        footer={
          <>
            <Button variant="primary" onClick={commitSplit} full>
              Create {splitChildren.length} parts
            </Button>
            <Button variant="quiet" onClick={() => setSplitOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-ink-3">
            This looks like several things in one line. Edit anything that came out wrong.
          </p>
          {splitChildren.map((child, i) => (
            <div key={i} className="flex gap-1.5">
              <input
                value={child}
                onChange={e => {
                  const next = [...splitChildren]
                  next[i] = e.target.value
                  setSplitChildren(next)
                }}
                className={inputClass}
              />
              <button
                onClick={() => setSplitChildren(splitChildren.filter((_, j) => j !== i))}
                className="px-2 text-ink-3 hover:text-dropped"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
          <p className="text-[11px] text-ink-3">
            The original wording is kept in notes, so nothing is lost if the split is wrong.
          </p>
        </div>
      </Sheet>
    </div>
  )
}

function EditForm({
  item, categories, onSave,
}: {
  item: Item
  categories: { id: string; name: string; color: string }[]
  onSave: (body: Record<string, unknown>) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [planned, setPlanned] = useState(item.planned_date ?? '')
  const [due, setDue] = useState(item.due_date ?? '')
  const [categoryId, setCategoryId] = useState(item.category_id ?? '')
  const [board, setBoard] = useState(item.board)
  const [link, setLink] = useState(item.link ?? '')

  return (
    <div className="space-y-3">
      <Field label="Title">
        <textarea
          value={title}
          onChange={e => setTitle(e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Planned">
          <input type="date" value={planned} onChange={e => setPlanned(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Hard deadline">
          <input type="date" value={due} onChange={e => setDue(e.target.value)} className={inputClass} />
        </Field>
      </div>

      <Field label="Category">
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputClass}>
          <option value="">None</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      <Field label="On the projects board">
        <select value={board} onChange={e => setBoard(e.target.value as Item['board'])} className={inputClass}>
          <option value="auto">When it has parts</option>
          <option value="pinned">Always</option>
          <option value="muted">Never</option>
        </select>
      </Field>

      <Field label="Link">
        <input
          type="url"
          inputMode="url"
          placeholder="https://docs.google.com/… or the admin portal"
          value={link}
          onChange={e => setLink(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                  className={`${inputClass} resize-none`} />
      </Field>

      <Button
        variant="primary"
        full
        onClick={() => onSave({
          title,
          notes: notes || null,
          planned_date: planned || null,
          due_date: due || null,
          category_id: categoryId || null,
          board,
          link: link.trim() || null,
        })}
      >
        Save
      </Button>
    </div>
  )
}
