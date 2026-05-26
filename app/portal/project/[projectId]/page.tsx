import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getContributorToken } from '@/lib/supabase/server'
import { ProjectStatus } from '@/lib/types/portal'
import ProjectAdminPortal from './ProjectAdminPortal'

export const revalidate = 0

const STATUS_COLORS: Record<ProjectStatus, string> = {
  on_track:        'bg-green-100 text-green-700',
  needs_followup:  'bg-amber-100 text-amber-700',
  waiting:         'bg-blue-100 text-blue-700',
  completed:       'bg-gray-100 text-gray-500',
}

function fmt(date: string | null) {
  if (!date) return null
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function PortalProjectAdminPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const token = await getContributorToken()
  if (!token) redirect('/portal')

  const db = createAdminClient()

  const { data: contributor } = await db
    .from('contributors')
    .select('id, name')
    .eq('access_token', token)
    .single()

  if (!contributor) redirect('/portal')

  const { data: membership } = await db
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('contributor_id', contributor.id)
    .single()

  if (!membership || membership.role !== 'admin') notFound()

  const { data: project } = await db
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const { data: tasks, error: tasksError } = await db
    .from('tasks')
    .select(`
      id, title, description, due_date, sort_order,
      subtasks (
        id, title, description, due_date,
        subtask_assignments (
          id, status, completed_at,
          contributors ( id, name ),
          subtask_updates ( id, content, created_at )
        )
      )
    `)
    .eq('project_id', projectId)
    .order('sort_order')

  console.log('tasksError:', tasksError)
  console.log('tasks count:', tasks?.length)

  const [
    { data: notes },
    { data: members },
    { data: allContributors },
    { data: notifications },
  ] = await Promise.all([
    db.from('project_notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    db.from('project_members')
      .select('contributor_id, role, contributors(id, name, email, phone, pin)')
      .eq('project_id', projectId),
    db.from('contributors').select('id, name, email').order('name'),
    db.from('subtask_updates')
      .select(`
        id, content, created_at,
        subtask_assignments (
          contributor_id,
          contributors ( name ),
          subtasks ( title, tasks ( title ) )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const totalSubtasks = (tasks ?? []).reduce((n, t: any) =>
    n + (t.subtasks?.length ?? 0), 0)
  const doneSubtasks = (tasks ?? []).reduce((n, t: any) =>
    n + (t.subtasks?.filter((s: any) =>
      s.subtask_assignments?.every((a: any) => a.status === 'completed')
    ).length ?? 0), 0)
  const progress = totalSubtasks > 0
    ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/portal/dashboard" className="hover:text-gray-600">← My tasks</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{project.name}</span>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
            ⭐ Project admin
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color }} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-gray-500 mt-0.5">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full
                                ${STATUS_COLORS[project.status as ProjectStatus]}`}>
                {project.status.replace('_', ' ')}
              </span>
              {project.due_date && (
                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full border">
                  Due {fmt(project.due_date)}
                </span>
              )}
            </div>
          </div>

          {totalSubtasks > 0 && (
            <div className="mt-5 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{doneSubtasks} of {totalSubtasks} subtasks complete</span>
                <span className="font-semibold text-gray-600">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                     style={{ width: `${progress}%`, backgroundColor: project.color }} />
              </div>
            </div>
          )}
        </div>

        <ProjectAdminPortal
          project={project}
          tasks={tasks ?? []}
          notes={notes ?? []}
          members={(members ?? []) as any}
          allContributors={allContributors ?? []}
          recentUpdates={notifications ?? []}
          contributorId={contributor.id}
        />

      </div>
    </main>
  )
}