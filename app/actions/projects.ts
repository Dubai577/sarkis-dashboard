'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/guard'

export async function createProject(formData: FormData) {
  await requireAdmin()

  const db = createAdminClient()

  const { error } = await db.from('projects').insert({
    name:        formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    status:      formData.get('status') as string,
    due_date:    (formData.get('due_date') as string) || null,
    color:       formData.get('color') as string,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/projects')
  redirect('/projects')
}

export async function updateProject(id: string, formData: FormData) {
  await requireAdmin()

  const db = createAdminClient()

  const { error } = await db.from('projects').update({
    name:        formData.get('name') as string,
    description: (formData.get('description') as string) || null,
    status:      formData.get('status') as string,
    due_date:    (formData.get('due_date') as string) || null,
    color:       formData.get('color') as string,
  }).eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/projects')
  revalidatePath(`/projects/${id}`)
  redirect(`/projects/${id}`)
}

export async function createNote(projectId: string, formData: FormData) {
  await requireAdmin()

  const db = createAdminClient()

  const { error } = await db.from('project_notes').insert({
    project_id:  projectId,
    content:     formData.get('content') as string,
    is_pinned:   formData.get('is_pinned') === 'true',
    visibility:  (formData.get('visibility') as string) || 'admin_only',
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}`)
}

export async function deleteProject(id: string) {
  await requireAdmin()

  const db = createAdminClient()

  const { error } = await db.from('projects').delete().eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/projects')
  redirect('/projects')
}
