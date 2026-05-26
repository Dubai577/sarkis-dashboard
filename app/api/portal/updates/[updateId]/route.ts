import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function getToken() {
  const cookieStore = await cookies()
  return cookieStore.get('contributor_token')?.value
}

async function verifyOwnership(updateId: string, token: string) {
  const db = createAdminClient()
  const { data } = await db
    .from('subtask_updates')
    .select('id, subtask_assignments!inner(contributors!inner(access_token))')
    .eq('id', updateId)
    .single()
  const contrib = (data?.subtask_assignments as any)?.contributors
  return contrib?.access_token === token ? data : null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ updateId: string }> }
) {
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updateId } = await params
  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  const owned = await verifyOwnership(updateId, token)
  if (!owned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()
  const { data: update } = await db
    .from('subtask_updates')
    .update({ content: content.trim() })
    .eq('id', updateId)
    .select()
    .single()

  return NextResponse.json({ update })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ updateId: string }> }
) {
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { updateId } = await params
  const owned = await verifyOwnership(updateId, token)
  if (!owned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = createAdminClient()
  await db.from('subtask_updates').delete().eq('id', updateId)
  return NextResponse.json({ ok: true })
}
