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

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get('contributor_token')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, contributorId, role } = await req.json()
  if (!projectId || !contributorId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const adminId = await verifyAdmin(token, projectId)
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()
  const { error } = await db.from('project_members').upsert({
    project_id:     projectId,
    contributor_id: contributorId,
    role:           role ?? 'contributor',
  }, { onConflict: 'project_id,contributor_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
