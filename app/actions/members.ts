'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/guard'

function generatePIN(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export async function addProjectMember(
  projectId:     string,
  contributorId: string,
  role:          'contributor' | 'admin'
) {
  await requireAdmin()

  const db = createAdminClient()
  const { error } = await db.from('project_members').upsert({
    project_id:     projectId,
    contributor_id: contributorId,
    role,
  }, { onConflict: 'project_id,contributor_id' })
  if (error) throw new Error(error.message)
  revalidatePath(`/manage/${projectId}`)
}

export async function updateMemberRole(
  projectId:     string,
  contributorId: string,
  role:          'contributor' | 'admin'
) {
  await requireAdmin()

  const db = createAdminClient()
  await db.from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('contributor_id', contributorId)
  revalidatePath(`/manage/${projectId}`)
}

export async function removeProjectMember(
  projectId:     string,
  contributorId: string,
) {
  await requireAdmin()

  const db = createAdminClient()
  await db.from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('contributor_id', contributorId)
  revalidatePath(`/manage/${projectId}`)
}

export async function createAndAddContributor(projectId: string, formData: FormData) {
  await requireAdmin()

  const db  = createAdminClient()
  const pin = generatePIN()

  const { data: contributor, error } = await db.from('contributors').insert({
    name:            formData.get('name') as string,
    email:           (formData.get('email') as string)     || null,
    phone:           (formData.get('phone') as string)     || null,
    role_name:       (formData.get('role_name') as string) || null,
    pin,
    pin_hash:        pin,
    notif_frequency: 'weekly',
  }).select('id').single()

  if (error || !contributor) throw new Error(error?.message ?? 'Failed to create contributor')

  await db.from('project_members').insert({
    project_id:     projectId,
    contributor_id: contributor.id,
    role:           (formData.get('role') as string) || 'contributor',
  })

  revalidatePath(`/manage/${projectId}`)
}
