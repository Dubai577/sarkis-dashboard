import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifyAdmin(token: string, projectId: string) {
  const db = createAdminClient()
  const { data: c } = await db.from('contributors')
    .select('id').eq('access_token', token).single()
  if (!c) return null
  const { data: m } = await db.from('project_members')
    .select('role').eq('contributor_id', c.id).eq('project_id', projectId).single()
  return m?.role === 'admin' ? c.id : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ subtaskId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('contributor_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subtaskId } = await params
  const body = await req.json()

  const db = createAdminClient()
  const { data: sub } = await db.from('subtasks')
    .select('task_id, tasks(project_id)')
    .eq('id', subtaskId)
    .single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const projectId = (sub.tasks as any)?.project_id
  const adminId = await verifyAdmin(token, projectId)
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const update: Record<string, any> = {}
  if (body.title       !== undefined) update.title       = body.title
  if (body.description !== undefined) update.description = body.description || null
  if (body.due_date    !== undefined) update.due_date    = body.due_date || null

  const { error } = await db.from('subtasks').update(update).eq('id', subtaskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ subtaskId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('contributor_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subtaskId } = await params
  const db = createAdminClient()
  const { data: sub } = await db.from('subtasks')
    .select('task_id, tasks(project_id)')
    .eq('id', subtaskId)
    .single()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const projectId = (sub.tasks as any)?.project_id
  const adminId = await verifyAdmin(token, projectId)
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.from('subtasks').delete().eq('id', subtaskId)
  return NextResponse.json({ ok: true })
}
