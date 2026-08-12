import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProjectStatus, TaskStatus } from '@/lib/types/portal'
import ProjectMembers from '@/components/projects/ProjectMembers'

export const revalidate = 0

const STATUS_COLORS: Record<ProjectStatus, string> = {
  on_track:        'bg-green-100 text-green-700',
  needs_followup:  'bg-amber-100 text-amber-700',
  waiting:         'bg-blue-100 text-blue-700',
  completed:       'bg-gray-100 text-gray-500',
}

const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending:     'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
}

function fmt(date: string | null) {
  if (!date) return '—'
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const [
    { data: project },
    { data: tasks },
    { data: notes },
    { data: allContributors },
    { data: members },
    { data: notifications },
  ] = await Promise.all([
    db.from('projects').select('*').eq('id', id).single(),
    db.from('tasks')
      .select(`
        *,
        task_assignments (
          id, status, completed_at, contributor_id,
          contributors ( id, name, email ),
          task_updates ( id, content, created_at )
        )
      `)
      .eq('project_id', id)
      .order('sort_order'),
    db.from('project_notes')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db.from('contributors').select('id, name, email').order('name'),
    db.from('project_members')
      .select('contributor_id, role, contributors(id, name, email, phone, pin, role_name, notif_frequency)')
      .eq('project_id', id)
      .order('created_at'),
    db.from('admin_notifications')
      .select(`
        *,
        task_assignments (
          status, completed_at,
          tasks ( title ),
          contributors ( name )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!project) notFound()

  const totalTasks = tasks?.length ?? 0
  const doneTasks  = tasks?.filter(t =>
    t.task_assignments?.every((a: any) => a.status === 'completed')
  ).length ?? 0
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const pinnedNote = notes?.find(n => n.is_pinned)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/manage" className="hover:text-gray-600 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">{project.name}</span>
        </div>

        {/* Project header */}
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
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full
                                ${STATUS_COLORS[project.status as ProjectStatus]}`}>
                {project.status.replace('_', ' ')}
              </span>
              {project.due_date && (
                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full border">
                  Due {fmt(project.due_date)}
                </span>
              )}
              <Link
                href={`/manage/${id}/dashboard`}
                className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200
                           px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors font-medium"
              >
                📊 Dashboard
              </Link>
              <Link
                href={`/manage/${id}/edit`}
                className="text-xs text-gray-500 bg-white border border-gray-200
                           px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
              >
                Edit project
              </Link>
            </div>
          </div>

          {totalTasks > 0 && (
            <div className="mt-5 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>{doneTasks} of {totalTasks} tasks complete</span>
                <span className="font-semibold text-gray-600">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                     style={{ width: `${progress}%`, backgroundColor: project.color }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Tasks (2/3) */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
              <Link
                href={`/manage/${id}/tasks/new`}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Add task
              </Link>
            </div>

            {tasks && tasks.length > 0 ? tasks.map((task: any) => (
              <Link
                key={task.id}
                href={`/manage/${id}/tasks/${task.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4
                           hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {task.description}
                      </p>
                    )}
                  </div>
                  {task.due_date && (
                    <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-50
                                     border rounded-lg px-2 py-1">
                      {fmt(task.due_date)}
                    </span>
                  )}
                </div>

                {task.task_assignments?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {task.task_assignments.map((a: any) => (
                      <span key={a.id}
                            className="flex items-center gap-1 text-xs bg-gray-50
                                       border border-gray-100 rounded-full px-2.5 py-1">
                        {a.contributors?.name}
                        <span className={`px-1.5 py-0.5 rounded-full text-xs
                                         ${TASK_STATUS_COLORS[a.status as TaskStatus]}`}>
                          {a.status.replace('_', ' ')}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            )) : (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">No tasks yet.</p>
                <Link
                  href={`/manage/${id}/tasks/new`}
                  className="mt-2 inline-block text-sm text-indigo-600 font-medium hover:underline"
                >
                  Add the first task →
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar (1/3) */}
          <div className="space-y-4">

            {/* Team members */}
            <ProjectMembers
              projectId={id}
              members={(members ?? []) as any}
              allContributors={allContributors ?? []}
            />

            {/* Pinned note */}
            {pinnedNote && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-600 mb-1.5">📌 Pinned note</p>
                <p className="text-sm text-amber-800 leading-relaxed">{pinnedNote.content}</p>
              </div>
            )}

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Notes</h3>
                <Link
                  href={`/manage/${id}/notes/new`}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  + Add
                </Link>
              </div>
              {notes && notes.filter(n => !n.is_pinned).length > 0 ? (
                <div className="space-y-2">
                  {notes.filter(n => !n.is_pinned).map(note => (
                    <div key={note.id}
                         className="text-xs text-gray-600 border-l-2 border-gray-200
                                    pl-2.5 py-0.5 leading-relaxed">
                      {note.content}
                      <span className="block text-gray-400 mt-0.5">{fmt(note.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No notes yet.</p>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent activity</h3>
              {notifications && notifications.length > 0 ? (
                <div className="space-y-3">
                  {notifications.slice(0, 8).map((n: any) => (
                    <div key={n.id} className="flex gap-2.5">
                      <span className="text-base leading-none mt-0.5">
                        {n.type === 'task_completed' ? '✅' : '💬'}
                      </span>
                      <div>
                        <p className="text-xs text-gray-700 leading-snug">
                          <span className="font-medium">
                            {n.task_assignments?.contributors?.name}
                          </span>
                          {n.type === 'task_completed' ? ' completed ' : ' posted an update on '}
                          <span className="font-medium">
                            {n.task_assignments?.tasks?.title}
                          </span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmt(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No activity yet.</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </main>
  )
}
