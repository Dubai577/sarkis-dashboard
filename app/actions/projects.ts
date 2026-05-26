'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

export async function createProject(formData: FormData) {
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

export async function deleteProject(id: string) {
  const db = createAdminClient()

  const { error } = await db.from('projects').delete().eq('id', id)

  if (error) throw new Error(error.message)

  revalidatePath('/projects')
  redirect('/projects')
}
