'use client'

import Link from 'next/link'
import { useMemo } from 'react'

// ── Helpers ──────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtShort(d: string | null) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_LABELS: Record<string, string> = {
  on_track:       'On track',
  needs_followup: 'Needs follow-up',
  waiting:        'Waiting',
  completed:      'Completed',
}
const STATUS_COLORS: Record<string, string> = {
  on_track:       'bg-green-100 text-green-700',
  needs_followup: 'bg-amber-100 text-amber-700',
  waiting:        'bg-blue-100 text-blue-700',
  completed:      'bg-gray-100 text-gray-500',
}

// ── Chart primitives ─────────────────────────────────────────────

function DonutChart({ pct, color, size = 140 }: { pct: number; color: string; size?: number }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const dash = Math.min(pct, 100) / 100 * circ
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="13" />
      {pct > 0 && (
        <circle
          cx="50" cy="50" r={r}
          fill="none" stroke={color} strokeWidth="13"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      )}
      <text x="50" y="44" textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827">
        {pct}%
      </text>
      <text x="50" y="60" textAnchor="middle" fontSize="9" fill="#9ca3af">complete</text>
    </svg>
  )
}

function Bar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

function StackedBar({
  completed, inProgress, total, color,
}: { completed: number; inProgress: number; total: number; color: string }) {
  const donePct = total > 0 ? (completed / total) * 100 : 0
  const inPPct  = total > 0 ? (inProgress / total) * 100 : 0
  return (
    <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className="absolute left-0 top-0 h-full bg-green-400 rounded-full"
           style={{ width: `${donePct}%` }} />
      <div className="absolute top-0 h-full bg-blue-300 rounded-l-none"
           style={{ left: `${donePct}%`, width: `${inPPct}%` }} />
    </div>
  )
}

function StatCard({
  label, value, sub, accent = false, icon,
}: { label: string; value: string | number; sub?: string; accent?: boolean; icon?: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? 'border-red-200 bg-red-50' : 'bg-white border-gray-200'}`}>
      {icon && <span className="text-xl mb-2 block">{icon}</span>}
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

// ── Main dashboard ───────────────────────────────────────────────

export default function ProjectDashboardClient({
  project, tasks, notes, members,
}: {
  project: any
  tasks:   any[]
  notes:   any[]
  members: any[]
}) {
  const color = project.color ?? '#6366f1'

  // ── Derived stats ──────────────────────────────────────────────

  const allSubtasks = useMemo(
    () => tasks.flatMap((t: any) => (t.subtasks ?? []).map((s: any) => ({ ...s, _task: t }))),
    [tasks],
  )

  const allAssignments = useMemo(
    () => allSubtasks.flatMap((s: any) => (s.subtask_assignments ?? []).map((a: any) => ({ ...a, _subtask: s }))),
    [allSubtasks],
  )

  const totalSubtasks = allSubtasks.length

  const completedSubtasks = allSubtasks.filter((s: any) => {
    const a = s.subtask_assignments ?? []
    return a.length > 0 && a.every((x: any) => x.status === 'completed')
  }).length

  const inProgressSubtasks = allSubtasks.filter((s: any) => {
    const a = s.subtask_assignments ?? []
    return a.some((x: any) => x.status === 'in_progress') &&
           !a.every((x: any) => x.status === 'completed')
  }).length

  const pendingSubtasks = totalSubtasks - completedSubtasks - inProgressSubtasks

  const overdueSubtasks = allSubtasks.filter((s: any) => {
    if (!s.due_date) return false
    const done = (s.subtask_assignments ?? []).every((x: any) => x.status === 'completed')
    return !done && new Date(s.due_date + 'T00:00:00') < new Date()
  }).length

  const overallPct = totalSubtasks > 0 ? Math.round(completedSubtasks / totalSubtasks * 100) : 0

  const daysLeft = project.due_date
    ? Math.ceil((new Date(project.due_date + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null

  // ── Per-contributor stats ──────────────────────────────────────

  const contribStats = useMemo(() => {
    const map: Record<string, any> = {}
    for (const a of allAssignments) {
      const cid = a.contributor_id
      if (!map[cid]) map[cid] = {
        id:        cid,
        name:      a.contributors?.name ?? '?',
        role_name: a.contributors?.role_name ?? null,
        total: 0, completed: 0, in_progress: 0, pending: 0,
      }
      map[cid].total++
      if      (a.status === 'completed')   map[cid].completed++
      else if (a.status === 'in_progress') map[cid].in_progress++
      else                                 map[cid].pending++
    }
    return Object.values(map).sort((a: any, b: any) => b.total - a.total)
  }, [allAssignments])

  // ── Per-task stats ─────────────────────────────────────────────

  const taskStats = useMemo(() => tasks.map((t: any) => {
    const subs  = t.subtasks ?? []
    const total = subs.length
    const done  = subs.filter((s: any) => {
      const a = s.subtask_assignments ?? []
      return a.length > 0 && a.every((x: any) => x.status === 'completed')
    }).length
    const inProg = subs.filter((s: any) => {
      const a = s.subtask_assignments ?? []
      return a.some((x: any) => x.status === 'in_progress') && !a.every((x: any) => x.status === 'completed')
    }).length
    const pct = total > 0 ? Math.round(done / total * 100) : 0
    return { id: t.id, title: t.title, due_date: t.due_date, total, done, inProg, pct, subtasks: subs }
  }), [tasks])

  // ── Recent activity ────────────────────────────────────────────

  const recentActivity = useMemo(() =>
    tasks
      .flatMap((t: any) => (t.subtasks ?? []).flatMap((s: any) =>
        (s.subtask_assignments ?? []).flatMap((a: any) =>
          (a.subtask_updates ?? []).map((u: any) => ({
            id:              u.id,
            content:         u.content,
            created_at:      u.created_at,
            contributorName: a.contributors?.name,
            subtaskTitle:    s.title,
            taskTitle:       t.title,
          }))
        )
      ))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 15)
  , [tasks])

  const pinnedNotes = notes.filter((n: any) => n.is_pinned)
  const otherNotes  = notes.filter((n: any) => !n.is_pinned)

  // ── Render ─────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/manage" className="hover:text-gray-600">Projects</Link>
            <span>/</span>
            <Link href={`/manage/${project.id}`} className="hover:text-gray-600">{project.name}</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">Dashboard</span>
          </div>
          <Link
            href={`/manage/${project.id}`}
            className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-white"
          >
            ← Summary view
          </Link>
        </div>

        {/* Project header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full
                                ${STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
              {project.due_date && (
                <span className="text-xs bg-gray-50 border rounded-full px-3 py-1.5 text-gray-400">
                  Due {fmt(project.due_date)}
                </span>
              )}
              <Link
                href={`/manage/${project.id}/edit`}
                className="text-xs border border-gray-200 px-3 py-1.5 rounded-full
                           text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Edit project
              </Link>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            label="Tasks"
            value={tasks.length}
            sub={`${taskStats.filter(t => t.pct === 100).length} fully done`}
            icon="📋"
          />
          <StatCard
            label="Sections"
            value={totalSubtasks}
            sub={`${completedSubtasks} complete`}
            icon="✅"
          />
          <StatCard
            label="Progress"
            value={`${overallPct}%`}
            sub={`${completedSubtasks} of ${totalSubtasks}`}
            icon="📈"
          />
          <StatCard
            label="Contributors"
            value={contribStats.length}
            sub={`${contribStats.filter((c: any) => c.in_progress > 0).length} active`}
            icon="👥"
          />
          <StatCard
            label="Overdue"
            value={overdueSubtasks}
            sub="sections past due"
            icon="⚠️"
            accent={overdueSubtasks > 0}
          />
          <StatCard
            label={daysLeft !== null ? (daysLeft >= 0 ? 'Days left' : 'Days over') : 'Deadline'}
            value={daysLeft !== null ? Math.abs(daysLeft) : '—'}
            sub={daysLeft !== null
              ? daysLeft === 0 ? 'due today'
              : daysLeft > 0  ? 'until deadline'
              :                 'past deadline'
              : 'no deadline set'}
            icon={daysLeft !== null && daysLeft < 0 ? '🔴' : '📅'}
            accent={daysLeft !== null && daysLeft < 0}
          />
        </div>

        {/* Main grid: 2/3 + 1/3 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column (2/3) ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Overall progress */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-6">Overall progress</h2>
              <div className="flex items-center gap-10">
                <DonutChart pct={overallPct} color={color} size={150} />
                <div className="flex-1 space-y-4">
                  {[
                    { label: 'Completed',   count: completedSubtasks,  color: '#4ade80' },
                    { label: 'In progress', count: inProgressSubtasks, color: '#60a5fa' },
                    { label: 'Pending',     count: pendingSubtasks,    color: '#d1d5db' },
                    ...(overdueSubtasks > 0
                      ? [{ label: 'Overdue', count: overdueSubtasks, color: '#f87171' }]
                      : []),
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: row.color }} />
                      <span className="text-sm text-gray-600 flex-1">{row.label}</span>
                      <span className="text-sm font-bold text-gray-900">{row.count}</span>
                      <span className="text-xs text-gray-400 w-10 text-right">
                        {totalSubtasks > 0 ? `${Math.round(row.count / totalSubtasks * 100)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Task breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-semibold text-gray-700">Task breakdown</h2>
                <Link
                  href={`/manage/${project.id}/tasks/new`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add task
                </Link>
              </div>
              {taskStats.length > 0 ? (
                <div className="space-y-5">
                  {taskStats.map(t => (
                    <Link key={t.id} href={`/manage/${project.id}/tasks/${t.id}`}
                          className="block group">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.pct === 100 ? '#4ade80' : color }}
                          />
                          <span className="text-sm font-medium text-gray-800
                                           group-hover:text-indigo-600 transition-colors truncate">
                            {t.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {t.inProg > 0 && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {t.inProg} active
                            </span>
                          )}
                          {t.due_date && (
                            <span className="text-xs text-gray-400">{fmtShort(t.due_date)}</span>
                          )}
                          <span className="text-xs text-gray-400">{t.done}/{t.total}</span>
                          <span className="text-xs font-bold text-gray-700 w-9 text-right">
                            {t.pct}%
                          </span>
                        </div>
                      </div>
                      <Bar
                        pct={t.pct}
                        color={t.pct === 100 ? '#4ade80' : color}
                        height={8}
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No tasks yet.</p>
              )}
            </div>

            {/* Contributor performance */}
            {contribStats.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-6">Team performance</h2>
                <div className="space-y-6">
                  {contribStats.map((c: any) => {
                    const pct = c.total > 0 ? Math.round(c.completed / c.total * 100) : 0
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center
                                         text-xs font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-800">{c.name}</span>
                              {c.role_name && (
                                <span className="text-xs text-indigo-500 ml-2">{c.role_name}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.in_progress > 0 && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                {c.in_progress} active
                              </span>
                            )}
                            {c.pending > 0 && (
                              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">
                                {c.pending} pending
                              </span>
                            )}
                            <span className="text-sm font-bold text-gray-700 w-10 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <StackedBar
                          completed={c.completed}
                          inProgress={c.in_progress}
                          total={c.total}
                          color={color}
                        />
                        <p className="text-xs text-gray-400 mt-1.5">
                          {c.completed} of {c.total} sections done
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent activity */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-6">Recent activity</h2>
                <div className="space-y-5">
                  {recentActivity.map((u: any) => (
                    <div key={u.id} className="flex gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center
                                    text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {u.contributorName?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700">
                          <span className="font-semibold">{u.contributorName}</span>
                          <span className="text-gray-400"> · </span>
                          <span className="text-gray-500">{u.subtaskTitle}</span>
                          <span className="text-gray-300"> in </span>
                          <span className="text-gray-400 italic">{u.taskTitle}</span>
                        </p>
                        <p className="text-xs text-gray-600 mt-1.5 leading-relaxed
                                      bg-gray-50 rounded-xl px-3 py-2.5 border-l-2 border-gray-200">
                          {u.content}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{fmt(u.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ── Right column (1/3) ── */}
          <div className="space-y-5">

            {/* Team */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Team</h2>
              {members.length > 0 ? (
                <div className="space-y-4">
                  {members.map((m: any) => {
                    const c    = m.contributors
                    const stat = contribStats.find((s: any) => s.id === c?.id)
                    const pct  = stat && stat.total > 0
                      ? Math.round(stat.completed / stat.total * 100) : 0
                    return (
                      <div key={m.contributor_id} className="flex items-start gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center
                                      text-sm font-bold text-white flex-shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {c?.name?.charAt(0).toUpperCase() ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{c?.name}</span>
                            {m.role === 'admin' && (
                              <span className="text-xs bg-indigo-50 text-indigo-600
                                               px-1.5 py-0.5 rounded-full font-medium">
                                admin
                              </span>
                            )}
                          </div>
                          {c?.role_name && (
                            <p className="text-xs text-indigo-500 mt-0.5">{c.role_name}</p>
                          )}
                          {c?.email && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{c.email}</p>
                          )}
                          {stat && (
                            <div className="mt-2">
                              <Bar pct={pct} color="#4ade80" height={4} />
                              <p className="text-xs text-gray-400 mt-1">
                                {stat.completed}/{stat.total} done
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No members yet.</p>
              )}
            </div>

            {/* Notes */}
            {(pinnedNotes.length > 0 || otherNotes.length > 0) && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
                  <Link
                    href={`/manage/${project.id}/notes/new`}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    + Add
                  </Link>
                </div>
                <div className="space-y-3">
                  {pinnedNotes.map((n: any) => (
                    <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      <p className="text-xs font-semibold text-amber-600 mb-1">📌 Pinned</p>
                      <p className="text-xs text-amber-800 leading-relaxed">{n.content}</p>
                    </div>
                  ))}
                  {otherNotes.slice(0, 6).map((n: any) => (
                    <div key={n.id} className="border-l-2 border-gray-100 pl-3 py-0.5">
                      <p className="text-xs text-gray-600 leading-relaxed">{n.content}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtShort(n.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All sections list */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">All sections</h2>
              {tasks.length > 0 ? (
                <div className="space-y-5">
                  {taskStats.map(t => (
                    <div key={t.id}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                          {t.title}
                        </p>
                        <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                          {t.done}/{t.total}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {(t.subtasks ?? []).map((s: any) => {
                          const asgn    = s.subtask_assignments ?? []
                          const allDone = asgn.length > 0 && asgn.every((a: any) => a.status === 'completed')
                          const anyInP  = asgn.some((a: any) => a.status === 'in_progress')
                          const names   = asgn.map((a: any) => a.contributors?.name).filter(Boolean)
                          return (
                            <div key={s.id} className="flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full flex-shrink-0
                                  ${allDone ? 'bg-green-400' : anyInP ? 'bg-blue-400' : 'bg-gray-200'}`}
                              />
                              <span className={`text-xs flex-1 truncate
                                ${allDone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                {s.title}
                              </span>
                              {names.length > 0 && (
                                <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[80px]">
                                  {names.join(', ')}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No sections yet.</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </main>
  )
}
