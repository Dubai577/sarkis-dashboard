import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import TaskDetailClient from './TaskDetailClient'

export const revalidate = 0

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>
}) {
  const { id: projectId, taskId } = await params
  const db = createAdminClient()

  const [
    { data: task },
    { data: subtasks },
    { data: allContributors },
    { data: allProjectTasks },
    { data: dependencies },
    { data: blocking },
    { data: resources },
  ] = await Promise.all([
    db.from('tasks').select('*').eq('id', taskId).single(),
    db.from('subtasks')
      .select(`*, subtask_assignments(id, status, completed_at, contributor_id, contributors(id, name, role_name))`)
      .eq('task_id', taskId)
      .order('sort_order'),
    db.from('contributors').select('id, name, email, role_name').order('name'),
    db.from('tasks').select('id, title').eq('project_id', projectId).neq('id', taskId),
    db.from('task_dependencies')
      .select(`depends_on_task_id, tasks!task_dependencies_depends_on_task_id_fkey(id, title)`)
      .eq('task_id', taskId),
    db.from('task_dependencies')
      .select(`task_id, tasks!task_dependencies_task_id_fkey(id, title)`)
      .eq('depends_on_task_id', taskId),
    db.from('task_resources')
      .select(`*, contributors(name)`)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
  ])

  if (!task) notFound()

  const { data: project } = await db
    .from('projects')
    .select('id, name, color')
    .eq('id', projectId)
    .single()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/projects" className="hover:text-gray-600">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-gray-600">
            {project?.name}
          </Link>
          <span>/</span>
          <span className="text-gray-700 font-medium truncate max-w-[200px]">{task.title}</span>
        </div>

        <TaskDetailClient
          task={task}
          subtasks={subtasks ?? []}
          allContributors={allContributors ?? []}
          allProjectTasks={allProjectTasks ?? []}
          dependencies={dependencies ?? []}
          blocking={blocking ?? []}
          resources={resources ?? []}
          projectId={projectId}
          projectColor={project?.color ?? '#6366f1'}
        />
      </div>
    </main>
  )
}
