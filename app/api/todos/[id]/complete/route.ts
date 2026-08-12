import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, readJson, serverError } from '@/lib/api/http'
import { setTodoComplete } from '@/lib/db/sync'

/**
 * POST /api/todos/[id]/complete
 *
 * The single write path for completing a task. A materialized todo and the
 * backlog item or Sweat assignment it came from are one commitment seen twice,
 * so they are written in one call. Two independent writes — one from the week
 * view, one from the project view — is exactly how the two end up disagreeing.
 *
 * Every surface that has a checkbox calls this, never PATCH is_complete.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  if (typeof body.is_complete !== 'boolean') {
    return badRequest('is_complete must be true or false.')
  }

  try {
    const todo = await setTodoComplete(id, body.is_complete)
    if (!todo) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json({ todo })
  } catch (err) {
    return serverError('todos.complete', err)
  }
}
