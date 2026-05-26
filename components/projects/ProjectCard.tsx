'use client'

import { useRouter } from 'next/navigation'
import { ProjectSummary, ProjectStatus } from '@/lib/types/portal'

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------

const STATUS: Record<ProjectStatus, { label: string; bg: string; text: string; dot: string }> = {
  on_track:       { label: 'On track',   bg: 'bg-green-50',  text: 'text-green-700', dot: 'bg-green-500'  },
  needs_followup: { label: 'Follow up',  bg: 'bg-amber-50',  text: 'text-amber-700', dot: 'bg-amber-500'  },
  waiting:        { label: 'Waiting',    bg: 'bg-blue-50',   text: 'text-blue-600',  dot: 'bg-blue-400'   },
  completed:      { label: 'Completed',  bg: 'bg-gray-100',  text: 'text-gray-500',  dot: 'bg-gray-400'   },
}

function fmt(date: string | null) {
  if (!date) return null
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function overdue(date: string | null, status: ProjectStatus) {
  if (!date || status === 'completed') return false
  return new Date(date + 'T00:00:00') < new Date()
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

export default function ProjectCard({ project }: { project: ProjectSummary }) {
  const router   = useRouter()
  const s        = STATUS[project.status]
  const progress = project.task_count > 0
    ? Math.round((project.completed_count / project.task_count) * 100)
    : 0
  const late = overdue(project.due_date, project.status)

  return (
    <article
      onClick={() => router.push(`/projects/${project.id}`)}
      className="group bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer
                 hover:border-gray-300 hover:shadow-md transition-all duration-150 flex flex-col gap-4"
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
            style={{ backgroundColor: project.color }}
          />
          <h3 className="font-semibold text-gray-900 leading-snug truncate
                         group-hover:text-indigo-700 transition-colors text-sm">
            {project.name}
          </h3>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium
                          px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0
                          ${s.bg} ${s.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      {/* ── Description ── */}
      {project.description && (
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 -mt-2">
          {project.description}
        </p>
      )}

      {/* ── Pinned note ── */}
      {project.pinned_note && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 -mt-1">
          <p className="text-xs text-amber-700 line-clamp-2 leading-relaxed">
            <span className="mr-1">📌</span>{project.pinned_note}
          </p>
        </div>
      )}

      {/* ── Progress ── */}
      {project.task_count > 0 ? (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">
              {project.completed_count} of {project.task_count} tasks
            </span>
            <span className="text-xs font-semibold text-gray-600">{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                backgroundColor: progress === 100 ? '#22c55e' : project.color,
              }}
            />
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No tasks yet</p>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50 mt-auto">
        <div className="flex items-center gap-2.5 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2
                   c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857
                   M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0
                   019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {project.contributor_count} contributor{project.contributor_count !== 1 ? 's' : ''}
          </span>
          {project.admin_count > 0 && (
            <span className="flex items-center gap-1 text-indigo-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955
                     11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824
                     10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {project.admin_count} admin{project.admin_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {project.due_date ? (
          <span className={`text-xs font-medium ${late ? 'text-red-500' : 'text-gray-400'}`}>
            {late ? '⚠ ' : ''}{fmt(project.due_date)}
          </span>
        ) : (
          <span className="text-xs text-gray-300">No due date</span>
        )}
      </div>
    </article>
  )
}
