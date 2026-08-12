'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PossessionGlyph } from '@/components/ui/Possession'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui/primitives'

interface PersonRow {
  id: string
  name: string
  role_name: string | null
  email: string | null
  open: number
  waiting: number
  dropped: number
}

/**
 * The people index.
 *
 * A large share of this workload is not "do a thing", it is "get a response
 * from someone" — 19 of the backlog rows are literally just a person's name.
 * Sorting puts anyone you have been waiting on too long first, because that is
 * the only ordering that changes what you do next.
 */
export default function PeoplePage() {
  const [people, setPeople] = useState<PersonRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/people')
      .then(async res => {
        if (res.status === 401) { window.location.href = '/login'; return null }
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Could not load people.')
        return body
      })
      .then(body => body && setPeople(body.people))
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div className="p-4"><ErrorBanner message={error} /></div>
  if (!people) return <Spinner label="Loading people" />

  const sorted = [...people].sort(
    (a, b) => b.dropped - a.dropped || b.waiting - a.waiting || a.name.localeCompare(b.name),
  )
  const waitingOnSomeone = people.filter(p => p.waiting + p.dropped > 0).length

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">People</h1>
        <p className="text-sm text-ink-2">
          {people.length} people · waiting on {waitingOnSomeone}
        </p>
      </header>

      {people.length === 0 ? (
        <EmptyState title="No people yet." />
      ) : (
        <div className="space-y-1.5">
          {sorted.map(person => (
            <Link
              key={person.id}
              href={`/people/${person.id}`}
              className={`flex items-center gap-3 rounded-md border bg-surface px-3 py-2.5 transition-colors hover:border-line-2 ${
                person.dropped > 0 ? 'border-dropped/40' : 'border-line'
              }`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] text-ink-2">
                {initials(person.name)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-sm">{person.name}</span>
                {person.role_name && (
                  <span className="block text-[11px] text-ink-3">{person.role_name}</span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-2.5 text-[11px] tnum text-ink-3">
                {person.dropped > 0 && (
                  <span className="flex items-center gap-1 text-dropped">
                    <PossessionGlyph state="dropped" size={10} />
                    {person.dropped}
                  </span>
                )}
                {person.waiting > 0 && (
                  <span className="flex items-center gap-1">
                    <PossessionGlyph state="theirs" size={10} />
                    {person.waiting}
                  </span>
                )}
                {person.open > 0 && <span>{person.open} open</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
