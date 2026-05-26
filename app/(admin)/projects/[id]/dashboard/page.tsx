import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import ProjectDashboardClient from './ProjectDashboardClient'

export const revalidate = 0

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = createAdminClient()

  const [
    { data: project },
    { data: tasks },
    { data: notes },
    { data: members },
  ] = await Promise.all([
    db.from('projects').select('*').eq('id', id).single(),
    db.from('tasks')
      .select(`
        id, title, description, due_date, sort_order,
        subtasks (
          id, title, description, due_date,
          subtask_assignments (
            id, status, completed_at, contributor_id,
            contributors ( id, name, role_name ),
            subtask_updates ( id, content, created_at )
          )
        )
      `)
      .eq('project_id', id)
      .order('sort_order'),
    db.from('project_notes')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false }),
    db.from('project_members')
      .select('contributor_id, role, contributors(id, name, email, phone, pin, role_name)')
      .eq('project_id', id),
  ])

  if (!project) notFound()

  return (
    <ProjectDashboardClient
      project={project}
      tasks={tasks ?? []}
      notes={notes ?? []}
      members={(members ?? []) as any[]}
    />
  )
}
