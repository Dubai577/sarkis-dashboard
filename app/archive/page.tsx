'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Button, EmptyState, ErrorBanner, Spinner } from '@/components/ui/primitives'
import { mediumLabel } from '@/lib/dates'

/**
 * The archive, and the way back out of it.
 *
 * Archiving replaced deleting, which only works if restoring is as easy as
 * archiving was. Without this page archive is a one-way trip, and a one-way
 * trip is just deleting with extra steps — which is the habit the whole rule
 * exists to break.
 */

interface Archived {
  id: string
  title: string
  parent_id: string | null
  archived_at: string
  category: { name: string; color: string } | null
}

export default function ArchivePage() {
  const [items, setItems] = useState<Archived[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/items?archived=only')
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load the archive.')
      setItems(body.items)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the archive.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function restore(id: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      })
      if (!res.ok) throw new Error('Could not restore that.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore that.')
    } finally {
      setBusy(null)
    }
  }

  if (error && !items) return <div className="p-4"><ErrorBanner message={error} onRetry={load} /></div>
  if (!items) return <Spinner label="Loading the archive" />

  // Roots first: restoring a root brings its children with it, so restoring
  // those individually is almost never what you want.
  const roots = items.filter(i => !i.parent_id)
  const children = items.filter(i => i.parent_id)

  return (
    <div className="mx-auto max-w-2xl px-3 py-4">
      <h1 className="mb-1 text-xl font-semibold">Archive</h1>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-2">
        Nothing here is deleted. Restoring a project brings its children back with it.
      </p>

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing archived."
          hint="Things you close land here rather than disappearing."
        />
      ) : (
        <>
          <Section
            label="Projects"
            rows={roots}
            busy={busy}
            onRestore={restore}
          />
          <Section
            label="Individual items"
            rows={children}
            busy={busy}
            onRestore={restore}
            hint="Restoring one of these leaves it where it was, under its parent."
          />
        </>
      )}
    </div>
  )
}

function Section({
  label, rows, busy, onRestore, hint,
}: {
  label: string
  rows: Archived[]
  busy: string | null
  onRestore: (id: string) => void
  hint?: string
}) {
  if (rows.length === 0) return null
  return (
    <section className="mb-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[10px] uppercase tracking-wider text-ink-3">{label}</h2>
        <span className="text-[10px] tnum text-ink-3">{rows.length}</span>
      </div>
      {hint && <p className="mb-1 text-[10px] text-ink-3">{hint}</p>}
      {rows.map(item => (
        <div key={item.id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
          <span
            className="h-4 w-[2px] shrink-0 rounded-full"
            style={{ background: item.category?.color ?? 'var(--border-2)' }}
          />
          <Link href={`/items/${item.id}`} className="clamp-1 min-w-0 flex-1 text-[13px] text-ink-2">
            {item.title}
          </Link>
          <span className="shrink-0 text-[10px] tnum text-ink-3">
            {mediumLabel(item.archived_at.slice(0, 10))}
          </span>
          <Button
            variant="quiet"
            onClick={() => onRestore(item.id)}
            disabled={busy === item.id}
            className="!min-h-[28px] shrink-0 !px-2 !text-[11px]"
          >
            {busy === item.id ? '…' : 'Restore'}
          </Button>
        </div>
      ))}
    </section>
  )
}
