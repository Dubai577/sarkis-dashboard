'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, ErrorBanner, Field, inputClass } from '@/components/ui/primitives'

/**
 * Bulk add — paste a list, commit it.
 *
 * Built because getting current data in is the actual blocker: the newest row
 * in the app is from June, while fifteen projects and dozens of tasks live in
 * WhatsApp threads and in the user's head. One-at-a-time capture is the right
 * tool for a thought during the day; it is the wrong tool for a backlog.
 *
 * The parent, category, person and date are chosen once for the whole paste,
 * because the slow part of entry is the per-row form, not the typing.
 */
export default function BulkPage() {
  const [text, setText] = useState('')
  const [parentId, setParentId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [waitingOn, setWaitingOn] = useState('')
  const [plannedDate, setPlannedDate] = useState('')

  const [roots, setRoots] = useState<{ id: string; title: string }[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; children: number } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/items?view=board').then(r => (r.ok ? r.json() : null)),
      fetch('/api/categories').then(r => (r.ok ? r.json() : null)),
      fetch('/api/people').then(r => (r.ok ? r.json() : null)),
    ]).then(([b, c, p]) => {
      const all = [...(b?.projects ?? []), ...(b?.areas ?? [])]
      setRoots(all.map((i: { id: string; title: string }) => ({ id: i.id, title: i.title })))
      setCategories(c?.categories ?? [])
      setPeople(p?.people ?? [])
    }).catch(() => {})
  }, [])

  /** The same parse the server does, so the preview cannot mislead. */
  const parsed = useMemo(() => {
    const out: { title: string; children: string[] }[] = []
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue
      const indented = /^(\s{2,}|\t|[-*•>]\s)/.test(raw)
      const title = raw.replace(/^[\s>\-*•]+/, '').trim()
      if (!title) continue
      if (indented && out.length > 0) out[out.length - 1].children.push(title)
      else out.push({ title, children: [] })
    }
    return out
  }, [text])

  const totalRows = parsed.length + parsed.reduce((n, r) => n + r.children.length, 0)

  async function commit() {
    if (totalRows === 0) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          parent_id: parentId || null,
          category_id: categoryId || null,
          waiting_on: waitingOn || null,
          planned_date: plannedDate || null,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not add those.')
      setResult({ created: body.created, children: body.children })
      setText('')        // cleared only after a confirmed success
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add those.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-3 py-4">
      <h1 className="mb-1 text-xl font-semibold">Bulk add</h1>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
        One per line. Indent a line — two spaces, a tab, or a dash — to make it a child of the
        line above.
      </p>

      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}

      {result && (
        <div className="mb-3 rounded-md border border-done/40 bg-done-soft px-3 py-2.5 text-[13px] text-done">
          Added {result.created} item{result.created === 1 ? '' : 's'}
          {result.children > 0 && ` and ${result.children} child${result.children === 1 ? '' : 'ren'}`}.{' '}
          <Link href="/projects" className="underline underline-offset-2">See them</Link>
        </div>
      )}

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={12}
        placeholder={'convent service trip\n  book the van\n  confirm numbers with omena\nsuscopts clergy portal\narabic translator'}
        className={`${inputClass} font-mono text-[13px] leading-relaxed`}
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Under">
          <select value={parentId} onChange={e => setParentId(e.target.value)} className={inputClass}>
            <option value="">Top level</option>
            {roots.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Waiting on">
          <select value={waitingOn} onChange={e => setWaitingOn(e.target.value)} className={inputClass}>
            <option value="">No one</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Planned date">
          <input type="date" value={plannedDate} onChange={e => setPlannedDate(e.target.value)}
                 className={inputClass} />
        </Field>
      </div>

      {totalRows > 0 && (
        <section className="mt-4">
          <h2 className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">
            Preview — {parsed.length} item{parsed.length === 1 ? '' : 's'}
            {totalRows > parsed.length && `, ${totalRows - parsed.length} nested`}
          </h2>
          <div className="rounded-md border border-line p-2">
            {parsed.map((r, i) => (
              <div key={i}>
                <div className="clamp-1 py-0.5 text-[13px]">{r.title}</div>
                {r.children.map((c, j) => (
                  <div key={j} className="clamp-1 py-0.5 pl-4 text-[12px] text-ink-2">{c}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4">
        <Button variant="primary" full disabled={busy || totalRows === 0} onClick={commit}>
          {busy ? 'Adding…' : totalRows === 0 ? 'Nothing to add' : `Add ${totalRows}`}
        </Button>
      </div>
    </div>
  )
}
