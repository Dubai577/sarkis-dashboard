'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwnerOrProjectAdmin } from '@/lib/auth/guard'

export async function addProjectNote(projectId: string, formData: FormData) {
  // Called from the contributor portal, so this cannot use requireAdmin().
  await requireOwnerOrProjectAdmin(projectId)

  const db = createAdminClient()
  const { error } = await db.from('project_notes').insert({
    project_id: projectId,
    content:    formData.get('content') as string,
    is_pinned:  formData.get('is_pinned') === 'true',
    visibility: (formData.get('visibility') as string) || 'admin_only',
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/portal/project/${projectId}`)
}
