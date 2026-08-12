import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import ProjectCard from '@/components/projects/ProjectCard'
import { ProjectSummary } from '@/lib/types/portal'

export const revalidate = 0  // always fresh

export default async function ProjectsDashboard() {
  const db = createAdminClient()

  const [{ data: projects }, { count: unreadCount }] = await Promise.all([
    db.from('project_summary').select('*').order('created_at', { ascending: false }),
    db.from('admin_notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])

  const byStatus = {
    active:    projects?.filter(p => p.status !== 'completed') ?? [],
    completed: projects?.filter(p => p.status === 'completed') ?? [],
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {byStatus.active.length} active · {byStatus.completed.length} completed
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification badge */}
            {!!unreadCount && unreadCount > 0 && (
              <Link
                href="/manage/notifications"
                className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100
                           text-amber-700 px-3 py-2 rounded-xl text-sm font-medium
                           transition-colors border border-amber-200"
              >
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                {unreadCount} new update{unreadCount > 1 ? 's' : ''}
              </Link>
            )}

            <Link
              href="/manage/contributors"
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600
                         bg-white border border-gray-200 hover:border-gray-300
                         hover:bg-gray-50 transition-colors"
            >
              Manage contributors
            </Link>

            <Link
              href="/manage/new"
              className="px-4 py-2 rounded-xl text-sm font-medium text-white
                         bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              + New project
            </Link>
          </div>
        </div>

        {/* ── Active projects ── */}
        {byStatus.active.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-10">
            {byStatus.active.map(p => (
              <ProjectCard key={p.id} project={p as ProjectSummary} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 text-gray-400">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-lg font-medium text-gray-500">No active projects</p>
            <p className="text-sm mt-1 mb-6">Create your first project to get started.</p>
            <Link
              href="/manage/new"
              className="inline-block px-5 py-2.5 bg-indigo-600 text-white
                         rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Create project
            </Link>
          </div>
        )}

        {/* ── Completed projects (collapsible section) ── */}
        {byStatus.completed.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2
                                text-sm font-medium text-gray-400 hover:text-gray-600
                                transition-colors mb-4 select-none">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90"
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              {byStatus.completed.length} completed project{byStatus.completed.length > 1 ? 's' : ''}
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
              {byStatus.completed.map(p => (
                <ProjectCard key={p.id} project={p as ProjectSummary} />
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  )
}
