'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState } from 'react'
import { Sheet, Button } from '@/components/ui/primitives'
import type { Possession } from '@/lib/possession'

/**
 * Filter and sort, persisted in the URL.
 *
 * Everything living in one list only works if it can be sliced, so this is a
 * bar rather than something buried in a menu: one tap from any list surface,
 * and the resulting view is linkable and survives a refresh because the state
 * is entirely in the query string.
 */

export const SORTS = [
  { value: 'heat', label: 'Needs me' },
  { value: 'due', label: 'Due date' },
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
  { value: 'added', label: 'Date added' },
  { value: 'alpha', label: 'A–Z' },
] as const

export type SortKey = (typeof SORTS)[number]['value']

export const DATE_FILTERS = [
  { value: '', label: 'Any' },
  { value: 'has', label: 'Has a date' },
  { value: 'none', label: 'No date' },
  { value: 'overdue', label: 'Overdue' },
] as const

export interface FilterState {
  sort: SortKey
  categories: string[]
  person: string
  possession: '' | Possession
  dates: '' | 'has' | 'none' | 'overdue'
  q: string
}

export function readFilters(params: URLSearchParams): FilterState {
  return {
    sort: (params.get('sort') as SortKey) || 'heat',
    categories: params.get('category')?.split(',').filter(Boolean) ?? [],
    person: params.get('person') ?? '',
    possession: (params.get('state') as FilterState['possession']) || '',
    dates: (params.get('dates') as FilterState['dates']) || '',
    q: params.get('q') ?? '',
  }
}

function writeFilters(state: FilterState): string {
  const p = new URLSearchParams()
  if (state.sort && state.sort !== 'heat') p.set('sort', state.sort)
  if (state.categories.length) p.set('category', state.categories.join(','))
  if (state.person) p.set('person', state.person)
  if (state.possession) p.set('state', state.possession)
  if (state.dates) p.set('dates', state.dates)
  if (state.q) p.set('q', state.q)
  return p.toString()
}

/** How many filters are on, for the badge. Sort is not a filter. */
export function activeCount(state: FilterState): number {
  return (
    (state.categories.length ? 1 : 0) +
    (state.person ? 1 : 0) +
    (state.possession ? 1 : 0) +
    (state.dates ? 1 : 0) +
    (state.q ? 1 : 0)
  )
}

export function FilterBar({
  state,
  categories,
  people,
  total,
  shown,
}: {
  state: FilterState
  categories: { id: string; name: string; color: string }[]
  people: { id: string; name: string }[]
  total: number
  shown: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  const apply = (next: Partial<FilterState>) => {
    const merged = { ...state, ...next }
    const qs = writeFilters(merged)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const active = activeCount(state)
  const sortLabel = SORTS.find(s => s.value === state.sort)?.label ?? 'Needs me'

  return (
    <>
      <div className="sticky top-0 z-20 -mx-3 mb-2 flex items-center gap-1.5 border-b border-line bg-bg/95 px-3 py-2 backdrop-blur">
        <input
          value={state.q}
          onChange={e => apply({ q: e.target.value })}
          placeholder="Search…"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink-3 focus:border-mine/60"
        />
        <button
          onClick={() => setOpen(true)}
          className={`shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] ${
            active > 0 ? 'border-mine text-mine' : 'border-line text-ink-2'
          }`}
        >
          Filter{active > 0 ? ` ${active}` : ''}
        </button>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-md border border-line px-2.5 py-1.5 text-[11px] text-ink-2"
        >
          {sortLabel}
        </button>
      </div>

      {(active > 0 || shown !== total) && (
        <div className="mb-2 flex items-center gap-2 text-[10px] text-ink-3">
          <span className="tnum">{shown} of {total}</span>
          {active > 0 && (
            <button
              onClick={() => router.replace(pathname, { scroll: false })}
              className="underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Sort and filter">
        <div className="space-y-4">
          <Group label="Sort by">
            {SORTS.map(s => (
              <Pill key={s.value} on={state.sort === s.value} onClick={() => apply({ sort: s.value })}>
                {s.label}
              </Pill>
            ))}
          </Group>

          <Group label="Category">
            {categories.map(c => {
              const on = state.categories.includes(c.name)
              return (
                <Pill
                  key={c.id}
                  on={on}
                  color={c.color}
                  onClick={() =>
                    apply({
                      categories: on
                        ? state.categories.filter(n => n !== c.name)
                        : [...state.categories, c.name],
                    })
                  }
                >
                  {c.name}
                </Pill>
              )
            })}
          </Group>

          <Group label="Possession">
            {([['', 'Any'], ['mine', 'On me'], ['theirs', 'Waiting'], ['dropped', 'Needs a nudge']] as const).map(
              ([value, label]) => (
                <Pill key={value} on={state.possession === value}
                      onClick={() => apply({ possession: value as FilterState['possession'] })}>
                  {label}
                </Pill>
              ),
            )}
          </Group>

          <Group label="Dates">
            {DATE_FILTERS.map(d => (
              <Pill key={d.value} on={state.dates === d.value}
                    onClick={() => apply({ dates: d.value as FilterState['dates'] })}>
                {d.label}
              </Pill>
            ))}
          </Group>

          <Group label="Person">
            <Pill on={!state.person} onClick={() => apply({ person: '' })}>Anyone</Pill>
            {people.map(p => (
              <Pill key={p.id} on={state.person === p.id} onClick={() => apply({ person: p.id })}>
                {p.name}
              </Pill>
            ))}
          </Group>

          <Button variant="primary" full onClick={() => setOpen(false)}>
            Show {shown}
          </Button>
        </div>
      </Sheet>
    </>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Pill({
  on, onClick, children, color,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${
        on ? 'border-mine bg-mine-soft text-mine' : 'border-line text-ink-2'
      }`}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  )
}
