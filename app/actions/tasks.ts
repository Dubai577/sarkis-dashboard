'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerOrProjectAdmin } from '@/lib/auth/guard'

// ── Tasks ────────────────────────────────────────────────────────

export async function createTask(projectId: string, formData: FormData) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { data: task, error } = await db.from('tasks').insert({
    project_id:  projectId,
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    due_date:    (formData.get('due_date') as string) || null,
  }).select().single()

  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}`)
  redirect(`/manage/${projectId}/tasks/${task.id}`)
}

export async function updateTask(taskId: string, projectId: string, formData: FormData) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('tasks').update({
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    due_date:    (formData.get('due_date') as string) || null,
  }).eq('id', taskId)

  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
  revalidatePath(`/manage/${projectId}`)
}

export async function deleteTask(taskId: string, projectId: string) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('tasks').delete().eq('id', taskId)
  revalidatePath(`/manage/${projectId}`)
  redirect(`/manage/${projectId}`)
}

// ── Subtasks ─────────────────────────────────────────────────────

export async function createSubtask(taskId: string, projectId: string, formData: FormData) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('subtasks').insert({
    task_id:     taskId,
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    due_date:    (formData.get('due_date') as string) || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function updateSubtask(
  subtaskId: string, taskId: string, projectId: string, formData: FormData,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('subtasks').update({
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || null,
    due_date:    (formData.get('due_date') as string) || null,
  }).eq('id', subtaskId)
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function deleteSubtask(subtaskId: string, taskId: string, projectId: string) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('subtasks').delete().eq('id', subtaskId)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

// ── Subtask assignments ──────────────────────────────────────────

export async function assignContributorToSubtask(
  subtaskId:      string,
  contributorId:  string,
  taskId:         string,
  projectId:      string,
  assignmentRole?: string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const row: any = { subtask_id: subtaskId, contributor_id: contributorId }
  if (assignmentRole?.trim()) row.assignment_role = assignmentRole.trim()
  const { error } = await db.from('subtask_assignments').upsert(
    row, { onConflict: 'subtask_id,contributor_id', ignoreDuplicates: true }
  )
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function updateAssignmentRole(
  assignmentId: string, role: string, taskId: string, projectId: string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('subtask_assignments')
    .update({ assignment_role: role.trim() || null })
    .eq('id', assignmentId)
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function updateSubtaskAssignmentStatus(
  assignmentId: string, status: string, taskId: string, projectId: string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('subtask_assignments')
    .update({ status })
    .eq('id', assignmentId)
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function removeSubtaskAssignment(
  subtaskId:     string,
  contributorId: string,
  taskId:        string,
  projectId:     string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('subtask_assignments')
    .delete()
    .eq('subtask_id', subtaskId)
    .eq('contributor_id', contributorId)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

// ── Dependencies ─────────────────────────────────────────────────

export async function addDependency(
  taskId:           string,
  dependsOnTaskId:  string,
  projectId:        string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('task_dependencies').upsert({
    task_id:            taskId,
    depends_on_task_id: dependsOnTaskId,
  }, { onConflict: 'task_id,depends_on_task_id', ignoreDuplicates: true })
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function removeDependency(
  taskId:           string,
  dependsOnTaskId:  string,
  projectId:        string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('task_dependencies')
    .delete()
    .eq('task_id', taskId)
    .eq('depends_on_task_id', dependsOnTaskId)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

// ── Resources ────────────────────────────────────────────────────

export async function addResource(taskId: string, projectId: string, formData: FormData) {
  await requireOwnerOrProjectAdmin(projectId)

  const db   = createAdminClient()
  const type = formData.get('type') as 'link' | 'note'
  const { error } = await db.from('task_resources').insert({
    task_id:      taskId,
    type,
    content:      formData.get('content') as string,
    label:        (formData.get('label') as string) || null,
    is_admin_post: true,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}

export async function deleteResource(
  resourceId: string,
  taskId:     string,
  projectId:  string,
) {
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  await db.from('task_resources').delete().eq('id', resourceId)
  revalidatePath(`/manage/${projectId}/tasks/${taskId}`)
}
