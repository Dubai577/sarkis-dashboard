import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

const WRITABLE = [
  'course', 'title', 'my_due_date', 'actual_due_date',
  'assignment_type', 'is_complete', 'start_time', 'end_time', 'due_date',
] as const

export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('sweat_tasks')
      .select('*')
      .order('actual_due_date', { ascending: true, nullsFirst: false })

    if (error) throw error
    return NextResponse.json({ tasks: data ?? [] })
  } catch (err) {
    return serverError('sweat.GET', err)
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const insert = pick(body, WRITABLE)
  const invalid = validateScalars(insert)
  if (invalid) return badRequest(invalid)

  if (typeof insert.title !== 'string' || !insert.title.trim()) {
    return badRequest('title is required.')
  }
  insert.title = insert.title.trim()

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('sweat_tasks').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json({ task: data }, { status: 201 })
  } catch (err) {
    return serverError('sweat.POST', err)
  }
}
