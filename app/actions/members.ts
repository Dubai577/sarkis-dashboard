'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export async function addProjectMember(
  projectId:     string,
  contributorId: string,
  role:          'contributor' | 'admin'
) {
  const db = createAdminClient()
  const { error } = await db.from('project_members').upsert({
    project_id:     projectId,
    contributor_id: contributorId,
    role,
  }, { onConflict: 'project_id,contributor_id' })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function updateMemberRole(
  projectId:     string,
  contributorId: string,
  role:          'contributor' | 'admin'
) {
  const db = createAdminClient()
  await db.from('project_members')
    .update({ role })
    .eq('project_id', projectId)
    .eq('contributor_id', contributorId)
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(
  projectId:     string,
  contributorId: string,
) {
  const db = createAdminClient()
  await db.from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('contributor_id', contributorId)
  revalidatePath(`/projects/${projectId}`)
}
