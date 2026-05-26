import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function getToken() {
  const cookieStore = await cookies()
  return cookieStore.get('contributor_token')?.value
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = await getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required.' }, { status: 400 })
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

  const { data: update, error } = await db
    .from('subtask_updates')
    .insert({ subtask_assignment_id: id, content: content.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  return NextResponse.json({ update })
}
