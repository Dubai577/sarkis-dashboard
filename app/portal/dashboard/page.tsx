import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getContributorToken } from '@/lib/supabase/server'
import ContributorDashboard from './ContributorDashboard'

export const revalidate = 0

export default async function PortalDashboardPage() {
  const token = await getContributorToken()
  if (!token) redirect('/portal')

  const db = createAdminClient()

  const { data: contributor } = await db
    .from('contributors')
    .select('id, name, email, phone, notif_frequency, role_name')
    .eq('access_token', token)
    .single()

  if (!contributor) redirect('/portal')

  // Get all project memberships
  const { data: memberships } = await db
    .from('project_members')
    .select('project_id, role, projects(id, name, color, status, due_date)')
    .eq('contributor_id', contributor.id)

  const projectIds = (memberships ?? []).map(m => m.project_id)

  // Get all subtask assignments for this contributor
  const { data: subtaskAssignments } = await db
    .from('subtask_assignments')
    .select(`
      id, status, completed_at,
      subtasks (
        id, title, description, due_date,
        tasks (
          id, title, project_id,
          task_resources ( id, type, content, label, is_admin_post, created_at,
            contributors(name)
          )
        )
      ),
      subtask_updates ( id, content, created_at )
    `)
    .eq('contributor_id', contributor.id)
    .order('created_at')

  // Fetch teammates (other contributors assigned to the same subtasks)
  const subtaskIds = (subtaskAssignments ?? [])
    .map(sa => (sa.subtasks as any)?.id)
    .filter(Boolean)

  let teammatesBySubtask: Record<string, any[]> = {}
  if (subtaskIds.length > 0) {
    const { data: otherAssignments } = await db
      .from('subtask_assignments')
      .select('subtask_id, contributors(name, email, phone, role_name)')
      .in('subtask_id', subtaskIds)
      .neq('contributor_id', contributor.id)

    for (const oa of otherAssignments ?? []) {
      const c = (oa as any).contributors
      if (!c) continue
      const sid = (oa as any).subtask_id
      if (!teammatesBySubtask[sid]) teammatesBySubtask[sid] = []
      teammatesBySubtask[sid].push(c)
    }
  }

  // For project admins — fetch full project data for their admin projects
  const adminProjectIds = (memberships ?? [])
    .filter(m => m.role === 'admin')
    .map(m => m.project_id)

  let adminProjectData: any[] = []
  if (adminProjectIds.length > 0) {
    const { data } = await db
      .from('tasks')
      .select(`
        id, title, description, due_date, project_id,
        subtasks (
          id, title, description, due_date,
          subtask_assignments (
            id, status, completed_at,
            contributors ( id, name ),
            subtask_updates ( id, content, created_at )
          )
        ),
        task_resources ( id, type, content, label, is_admin_post, created_at,
          contributors(name)
        )
      `)
      .in('project_id', adminProjectIds)
      .order('sort_order')
    adminProjectData = data ?? []
  }

  // Group subtask assignments by project → task
  const grouped: Record<string, {
    project_id:    string
    project_name:  string
    project_color: string
    role:          string
    tasks: Record<string, {
      task_id:    string
      task_title: string
      subtasks:   any[]
    }>
  }> = {}

  for (const m of memberships ?? []) {
    const proj = m.projects as any
    if (!proj) continue
    grouped[m.project_id] = {
      project_id:    m.project_id,
      project_name:  proj.name,
      project_color: proj.color,
      role:          m.role,
      tasks:         {},
    }
  }

  for (const sa of subtaskAssignments ?? []) {
    const subtask = sa.subtasks as any
    const task    = subtask?.tasks as any
    if (!subtask || !task) continue
    const projectId = task.project_id
    if (!grouped[projectId]) continue

    if (!grouped[projectId].tasks[task.id]) {
      grouped[projectId].tasks[task.id] = {
        task_id:    task.id,
        task_title: task.title,
        subtasks:   [],
      }
    }

    grouped[projectId].tasks[task.id].subtasks.push({
      assignment_id:   sa.id,
      status:          sa.status,
      completed_at:    sa.completed_at,
      subtask_id:      subtask.id,
      subtask_title:   subtask.title,
      subtask_desc:    subtask.description,
      subtask_due:     subtask.due_date,
      updates:         sa.subtask_updates ?? [],
      resources:       task.task_resources ?? [],
      teammates:       teammatesBySubtask[subtask.id] ?? [],
    })
  }

  const projectGroups = Object.values(grouped).map(g => ({
    ...g,
    tasks: Object.values(g.tasks),
  }))

  const pendingCount = (subtaskAssignments ?? [])
    .filter(sa => sa.status !== 'completed').length

  return (
    <ContributorDashboard
      contributor={contributor}
      projectGroups={projectGroups}
      adminProjectData={adminProjectData}
      pendingCount={pendingCount}
    />
  )
}
