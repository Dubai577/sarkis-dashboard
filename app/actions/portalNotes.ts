'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export async function addProjectNote(projectId: string, formData: FormData) {
  const db = createAdminClient()
  const { error } = await db.from('project_notes').insert({
    project_id: projectId,
    content:    formData.get('content') as string,
    is_pinned:  formData.get('is_pinned') === 'true',
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/project/${projectId}`)
}
