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
  const { type, label, content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required.' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: assignment } = await db
    .from('subtask_assignments')
    .select('id, subtasks(task_id), contributors!inner(id, access_token)')
    .eq('id', id)
    .single()

  const contrib = (assignment as any)?.contributors
  if (!assignment || contrib?.access_token !== token) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const taskId = (assignment as any)?.subtasks?.task_id
  if (!taskId) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })

  const { data: resource, error } = await db
    .from('task_resources')
    .insert({
      task_id:        taskId,
      type:           type || 'note',
      content:        content.trim(),
      label:          label?.trim() || null,
      is_admin_post:  false,
      contributor_id: contrib.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  return NextResponse.json({ resource })
}
