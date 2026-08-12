'use client'

import Link from 'next/link'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PossessionGlyph, PossessionLegend } from '@/components/ui/Possession'
import { EmptyState, ErrorBanner, Spinner } from '@/components/ui/primitives'
import { mediumLabel, today as todayIso } from '@/lib/dates'
import { FilterBar, readFilters } from '@/components/FilterBar'

interface Project {
  id: string
  title: string
  possession: 'mine' | 'theirs' | 'dropped'
  band: 'critical' | 'warm' | 'steady' | 'quiet'
  heat: number
  child_count: number
  open_child_count: number
  blocked_child_count: number
  planned_date: string | null
  due_date: string | null
  updated_at: string
  created_at: string
  waiting_on: string | null
  category: { id: string; name: string; color: string; is_area: boolean } | null
  waiting_person: { id: string; name: string } | null
  people: { id: string; name: string }[]
}

interface BoardPayload { projects: Project[]; areas: Project[] }

/**
 * The projects board — the surface named most important.
 *
 * Everything visible at once, ordered by computed heat. Not alphabetically, and
 * not by the stored priority field: 42 of 82 rows say "Soon", so sorting by it
 * mostly sorts noise.
 *
 * There is no progress bar anywhere here. Of 137 rows ever imported, not one was
 * marked Done — finishing something has always meant deleting it — so a
 * percentage would be measuring a number that never moves. What is shown
 * instead is possession balance and whether anything has moved lately.
 */
function ProjectsView() {
  const params = useSearchParams()
  const filters = readFilters(new URLSearchParams(params.toString()))

  const [data, setData] = useState<BoardPayload | null>(null)
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAreas, setShowAreas] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/items?view=board')
      if (res.status === 401) { window.location.href = '/login'; return }
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Could not load projects.')
      setData(body)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/categories').then(r => r.ok ? r.json() : null).then(d => d && setCategories(d.categories)).catch(() => {})
    fetch('/api/people').then(r => r.ok ? r.json() : null).then(d => d && setPeople(d.people)).catch(() => {})
  }, [])

  useEffect(() => {
    const onCapture = () => load()
    window.addEventListener('merc:captured', onCapture)
    return () => window.removeEventListener('merc:captured', onCapture)
  }, [load])

  const shown = useMemo(() => {
    const list = data?.projects ?? []
    const q = filters.q.trim().toLowerCase()
    const filtered = list.filter(p => {
      if (q && !p.title.toLowerCase().includes(q)) return false
      if (filters.categories.length && !filters.categories.includes(p.category?.name ?? '')) return false
      if (filters.possession && p.possession !== filters.possession) return false
      if (filters.person) {
        const linked = p.waiting_on === filters.person ||
          (p.people ?? []).some((x: { id: string }) => x.id === filters.person)
        if (!linked) return false
      }
      const date = p.due_date ?? p.planned_date
      if (filters.dates === 'has' && !date) return false
      if (filters.dates === 'none' && date) return false
      if (filters.dates === 'overdue' && !(date && date < todayIso())) return false
      return true
    })

    const sorted = [...filtered]
    switch (filters.sort) {
      case 'due':
        sorted.sort((a, b) => (a.due_date ?? a.planned_date ?? '9999').localeCompare(b.due_date ?? b.planned_date ?? '9999')); break
      case 'category':
        sorted.sort((a, b) => (a.category?.name ?? 'zzz').localeCompare(b.category?.name ?? 'zzz')); break
      case 'alpha':
        sorted.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'added':
        sorted.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')); break
      default:
        sorted.sort((a, b) => b.heat - a.heat || a.title.localeCompare(b.title))
    }
    return sorted
  }, [data, filters])

  if (loading) return <Spinner label="Loading projects" />

  const areaOpen = data?.areas.reduce((n, a) => n + a.open_child_count, 0) ?? 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <header className="mb-2">
        <h1 className="text-xl font-semibold">Projects</h1>
      </header>

      <FilterBar
        state={filters}
        categories={categories}
        people={people}
        total={data?.projects.length ?? 0}
        shown={shown.length}
      />

      <PossessionLegend className="mb-4 px-0.5" />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      {data && data.projects.length === 0 && (
        <EmptyState
          title="No projects yet."
          hint="Anything with a second line under it becomes a project. Capture a line and add to it."
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map(project => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>

      {/* Life-areas recede rather than compete. They are containers that never
          complete, so on the board they would be permanent noise. */}
      {data && data.areas.length > 0 && (
        <section className="mt-4">
          <button
            onClick={() => setShowAreas(!showAreas)}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-left"
          >
            <span className="text-sm text-ink-2">Areas</span>
            <span className="truncate text-xs text-ink-3">
              {data.areas.map(a => a.title).join(' · ')}
            </span>
            <span className="ml-auto shrink-0 text-[11px] tnum text-ink-3">
              {areaOpen} {showAreas ? '▲' : '▼'}
            </span>
          </button>

          {showAreas && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {data.areas.map(area => <ProjectCard key={area.id} project={area} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const stale = daysSince(project.updated_at)

  // The possession bar: proportions of mine / theirs / dropped across the
  // project's open children, so the balance reads at a glance.
  const dropped = project.blocked_child_count
  const open = project.open_child_count
  const rest = Math.max(0, open - dropped)

  const meta: string[] = []
  if (open > 0) meta.push(`${open} open`)
  if (project.waiting_person) meta.push(project.waiting_person.name)
  if (project.due_date) meta.push(`due ${mediumLabel(project.due_date)}`)
  else if (project.planned_date) meta.push(mediumLabel(project.planned_date))
  if (open > 0 && stale > 21) meta.push(`quiet ${stale}d`)

  const accent =
    project.band === 'critical' ? 'border-dropped/40'
      : project.band === 'warm' ? 'border-mine/30'
      : 'border-line'

  return (
    <Link
      href={`/items/${project.id}`}
      className={`block rounded-lg border bg-surface p-3 transition-colors hover:border-line-2 ${accent}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-3 w-[3px] shrink-0 rounded-full"
          style={{ background: project.category?.color ?? 'var(--border-2)' }}
        />
        <span className="clamp-1 flex-1 text-sm font-medium">{project.title}</span>
        <PossessionGlyph state={project.possession} size={12} />
      </div>

      {open > 0 && (
        <div className="mb-2 flex h-[3px] overflow-hidden rounded-full bg-surface-3">
          {dropped > 0 && <span style={{ flex: dropped, background: 'var(--dropped)' }} />}
          {rest > 0 && <span style={{ flex: rest, background: 'var(--mine)' }} />}
        </div>
      )}

      <div className="text-[11px] tnum text-ink-3">
        {meta.length > 0 ? meta.join(' · ') : 'Nothing open'}
        {dropped > 0 && <span className="text-dropped"> · {dropped} stalled</span>}
      </div>
    </Link>
  )
}

function daysSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000))
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsView />
    </Suspense>
  )
}
