import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getContributorToken } from '@/lib/supabase/server'
import ProjectDashboardClient from '@/app/(admin)/manage/[id]/dashboard/ProjectDashboardClient'

export const revalidate = 0

export default async function PortalAdminDashboardPage({
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
    .select('id')
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

  const [
    { data: project },
    { data: tasks },
    { data: notes },
    { data: members },
  ] = await Promise.all([
    db.from('projects').select('*').eq('id', projectId).single(),
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
      .eq('project_id', projectId)
      .order('sort_order'),
    db.from('project_notes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    db.from('project_members')
      .select('contributor_id, role, contributors(id, name, email, phone, pin, role_name)')
      .eq('project_id', projectId),
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
