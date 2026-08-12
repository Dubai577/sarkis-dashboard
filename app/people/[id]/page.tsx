'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { ItemRow } from '@/components/rows'
import { Button, EmptyState, ErrorBanner, Spinner } from '@/components/ui/primitives'

interface ItemLike {
  id: string
  title: string
  possession: 'mine' | 'theirs' | 'dropped'
  project: string | null
  category: { color: string; name: string } | null
  waiting_person: { id: string; name: string } | null
  waiting_since: string | null
  nudge_after: number
}

interface Payload {
  person: { id: string; name: string; email: string | null; phone: string | null; role_name: string | null }
  waiting: ItemLike[]
  dropped: ItemLike[]
  involved: ItemLike[]
}

/**
 * One person, every thread.
 *
 * This is the view the people model exists for. "Matthews" was three separate
 * records — a contributor, a Money backlog row, and a line inside an OCCM VT
 * item — with nothing connecting them, so remembering what you owed him meant
 * scrolling three sections.
 */
export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/people/${id}`)
      .then(async res => {
        if (res.status === 401) { window.location.href = '/login'; return null }
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Could not load this person.')
        return body
      })
      .then(body => body && setData(body))
      .catch(e => setError(e.message))
  }, [id])

  if (error) return <div className="p-4"><ErrorBanner message={error} /></div>
  if (!data) return <Spinner label="Loading" />

  const { person, waiting, dropped, involved } = data
  const total = waiting.length + dropped.length + involved.length

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <nav className="mb-3 text-xs text-ink-3">
        <Link href="/people" className="hover:text-ink-2">People</Link>
      </nav>

      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm text-mine">
          {person.name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{person.name}</h1>
          <p className="text-[11px] text-ink-3">
            {[person.role_name, person.email, person.phone].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
        </div>
      </header>

      {(person.email || person.phone) && (
        <div className="mb-5 flex gap-1.5">
          {person.phone && (
            <a href={`sms:${person.phone}`} className="flex-1">
              <Button variant="quiet" full>Message</Button>
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className="flex-1">
              <Button variant="quiet" full>Email</Button>
            </a>
          )}
        </div>
      )}

      {total === 0 && (
        <EmptyState
          title="Nothing involves them right now."
          hint="Set an item to “waiting on” them and it will appear here."
        />
      )}

      <Group label="Needs a nudge" tone="dropped" items={dropped}
             hint="Waiting longer than you meant to" />
      <Group label="Waiting on them" items={waiting} />
      <Group label="Also involved" items={involved} />
    </div>
  )
}

function Group({
  label, items, tone, hint,
}: {
  label: string
  items: ItemLike[]
  tone?: 'dropped'
  hint?: string
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className={`text-[11px] font-medium uppercase tracking-wider ${
          tone === 'dropped' ? 'text-dropped' : 'text-ink-2'
        }`}>
          {label}
        </h2>
        <span className="text-[11px] tnum text-ink-3">{items.length}</span>
        {hint && <span className="ml-auto text-[11px] text-ink-3">{hint}</span>}
      </div>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id}>
            <ItemRow item={item} href={`/items/${item.id}`} />
            {item.project && (
              <div className="px-2.5 pt-0.5 text-[10px] text-ink-3">{item.project}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
