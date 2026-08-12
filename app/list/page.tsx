'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ItemRow } from '@/components/rows'
import { FilterBar, readFilters } from '@/components/FilterBar'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui/primitives'
import { today as todayIso } from '@/lib/dates'

/**
 * Everything, flat.
 *
 * Once life, service, gifts, school and one-off projects all live in one tree,
 * the flat list is only usable if it can be sliced — so this surface is the
 * filter bar plus whatever survives it. Sorting and filtering happen here in
 * the browser because the whole set is a few hundred rows and already loaded;
 * that keeps the interaction instant. If items ever reaches the low thousands
 * this moves into the query.
 */

interface Row {
  id: string
  title: string
  parent_id: string | null
  possession: 'mine' | 'theirs' | 'dropped'
  heat: number
  priority: string | null
  planned_date: string | null
  due_date: string | null
  created_at: string
  category: { id: string; name: string; color: string } | null
  waiting_on: string | null
  waiting_person: { id: string; name: string } | null
  waiting_since: string | null
  nudge_after: number
  child_count: number
  open_child_count: number
  people: { id: string; name: string }[]
}

const PRIORITY_RANK: Record<string, number> = {
  Urgent: 0, Soon: 1, Whenever: 2, 'N/A': 3,
}

function ListView() {
  const params = useSearchParams()
  const state = readFilters(new URLSearchParams(params.toString()))

  const [items, setItems] = useState<Row[] | null>(null)
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/items').then(r => (r.ok ? r.json() : null)),
      fetch('/api/categories').then(r => (r.ok ? r.json() : null)),
      fetch('/api/people').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([i, c, p]) => {
        if (!i) { window.location.href = '/login'; return }
        setItems(i.items)
        setCategories(c?.categories ?? [])
        setPeople(p?.people ?? [])
      })
      .catch(() => setError('Could not load the list.'))
  }, [])

  const shown = useMemo(() => {
    if (!items) return []
    const now = todayIso()
    const q = state.q.trim().toLowerCase()

    const filtered = items.filter(item => {
      if (q && !item.title.toLowerCase().includes(q)) return false
      if (state.categories.length && !state.categories.includes(item.category?.name ?? '')) return false
      if (state.possession && item.possession !== state.possession) return false
      if (state.person) {
        const linked = item.waiting_on === state.person || item.people.some(p => p.id === state.person)
        if (!linked) return false
      }
      const date = item.due_date ?? item.planned_date
      if (state.dates === 'has' && !date) return false
      if (state.dates === 'none' && date) return false
      if (state.dates === 'overdue' && !(date && date < now)) return false
      return true
    })

    const sorted = [...filtered]
    switch (state.sort) {
      case 'due':
        sorted.sort((a, b) =>
          (a.due_date ?? a.planned_date ?? '9999').localeCompare(b.due_date ?? b.planned_date ?? '9999'))
        break
      case 'category':
        sorted.sort((a, b) =>
          (a.category?.name ?? 'zzz').localeCompare(b.category?.name ?? 'zzz') ||
          a.title.localeCompare(b.title))
        break
      case 'priority':
        sorted.sort((a, b) =>
          (PRIORITY_RANK[a.priority ?? 'N/A'] ?? 9) - (PRIORITY_RANK[b.priority ?? 'N/A'] ?? 9) ||
          b.heat - a.heat)
        break
      case 'added':
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
      case 'alpha':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
        break
      default:
        sorted.sort((a, b) => b.heat - a.heat || a.title.localeCompare(b.title))
    }
    return sorted
  }, [items, state])

  if (error) return <div className="p-4"><ErrorBanner message={error} /></div>
  if (!items) return <Spinner label="Loading everything" />

  // Grouped headers only when sorting by category, where they carry meaning.
  const grouped = state.sort === 'category'
  let lastGroup = ''

  return (
    <div className="mx-auto max-w-2xl px-3 py-4">
      <h1 className="mb-2 text-xl font-semibold">Everything</h1>

      <FilterBar
        state={state}
        categories={categories}
        people={people}
        total={items.length}
        shown={shown.length}
      />

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches." hint="Clear a filter to widen the list." />
      ) : (
        <div>
          {shown.map(item => {
            const group = item.category?.name ?? 'Uncategorised'
            const header = grouped && group !== lastGroup
            if (header) lastGroup = group
            return (
              <div key={item.id}>
                {header && (
                  <h2 className="mt-3 border-b border-line pb-1 text-[10px] uppercase tracking-wider text-ink-3">
                    {group}
                  </h2>
                )}
                <ItemRow item={item} href={`/items/${item.id}`} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ListPage() {
  return (
    <Suspense fallback={<Spinner label="Loading everything" />}>
      <ListView />
    </Suspense>
  )
}
