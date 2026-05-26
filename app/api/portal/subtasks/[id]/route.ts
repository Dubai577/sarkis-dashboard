import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function getToken() {
  const cookieStore = await cookies()
  return cookieStore.get('contributor_token')?.value
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json()
  const valid = ['pending', 'in_progress', 'completed']
  if (!valid.includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: assignment } = await db
    .from('subtask_assignments')
    .select('id, contributors!inner(access_token)')
    .eq('id', id)
    .single()

  const contrib = (assignment as any)?.contributors
  if (!assignment || contrib?.access_token !== token) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const { error } = await db
    .from('subtask_assignments')
    .update({ status })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
