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
  { params }: { params: Promise<{ contributorId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('contributor_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contributorId } = await params
  const body = await req.json()
  const { projectId, ...fields } = body

  const adminId = await verifyAdmin(token, projectId)
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const update: Record<string, any> = {}
  for (const key of ['name', 'role_name', 'email', 'phone'] as const) {
    if (fields[key] !== undefined) update[key] = fields[key] || null
  }

  const db = createAdminClient()
  const { error } = await db.from('contributors').update(update).eq('id', contributorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ contributorId: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('contributor_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contributorId } = await params
  const projectId = new URL(req.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const adminId = await verifyAdmin(token, projectId)
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()
  await db.from('project_members')
    .delete()
    .eq('contributor_id', contributorId)
    .eq('project_id', projectId)
  return NextResponse.json({ ok: true })
}
