'use server'

// TODO: run these in Supabase:
// ALTER TABLE contributors ADD COLUMN IF NOT EXISTS role_name text;
// ALTER TABLE subtask_assignments ADD COLUMN IF NOT EXISTS assignment_role text;

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/guard'

function generatePIN(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export async function createContributor(formData: FormData) {
  await requireAdmin()

  const db  = createAdminClient()
  const pin = generatePIN()

  const { error } = await db.from('contributors').insert({
    name:             formData.get('name') as string,
    email:            (formData.get('email') as string)  || null,
    phone:            (formData.get('phone') as string)  || null,
    role_name:        (formData.get('role_name') as string) || null,
    pin,
    pin_hash:         pin, // pgcrypto hashing happens via SQL trigger below
    notif_frequency:  formData.get('notif_frequency') as string || 'weekly',
  })

  if (error) throw new Error(error.message)

  revalidatePath('/projects/contributors')
  redirect('/projects/contributors')
}

export async function updateContributor(id: string, formData: FormData) {
  await requireAdmin()

  const db = createAdminClient()

  const { error } = await db.from('contributors').update({
    name:            formData.get('name') as string,
    email:           (formData.get('email') as string) || null,
    phone:           (formData.get('phone') as string) || null,
    role_name:       (formData.get('role_name') as string) || null,
    notif_frequency: formData.get('notif_frequency') as string,
  }).eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/projects/contributors')
  redirect('/projects/contributors')
}

export async function deleteContributor(id: string) {
  await requireAdmin()

  const db = createAdminClient()
  const { error } = await db.from('contributors').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/projects/contributors')
  redirect('/projects/contributors')
}

export async function resetPIN(id: string) {
  await requireAdmin()

  const db  = createAdminClient()
  const pin = generatePIN()

  const { error } = await db.from('contributors').update({
    pin,
    pin_hash: pin,
  }).eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/projects/contributors')
}

export async function assignContributorToProject(
  contributorId: string,
  projectId:     string
) {
  await requireAdmin()

  const db = createAdminClient()

  // Get all tasks in this project and create assignments for each
  const { data: tasks } = await db
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)

  if (tasks && tasks.length > 0) {
    const assignments = tasks.map(t => ({
      task_id:        t.id,
      contributor_id: contributorId,
    }))

    await db
      .from('task_assignments')
      .upsert(assignments, { onConflict: 'task_id,contributor_id', ignoreDuplicates: true })
  }

  revalidatePath(`/projects/${projectId}`)
}
