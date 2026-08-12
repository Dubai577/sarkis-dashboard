import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { loadItemViews } from '@/lib/db/items'

/**
 * Everything involving one person, across every project.
 *
 * This is the view the model exists for: "Matthews" was a contributor, a Money
 * backlog row, and a line inside an OCCM VT item — three records, no connection.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params

  try {
    const db = createAdminClient()
    const [{ data: person }, items] = await Promise.all([
      db.from('people').select('*').eq('id', id).maybeSingle(),
      loadItemViews(),
    ])

    if (!person) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const roots = new Map(items.filter(i => !i.parent_id).map(i => [i.id, i]))
    const projectOf = (itemId: string): string | null => {
      let cursor = items.find(i => i.id === itemId)
      const guard = new Set<string>()
      while (cursor?.parent_id && !guard.has(cursor.id)) {
        guard.add(cursor.id)
        cursor = items.find(i => i.id === cursor!.parent_id)
      }
      return cursor && roots.has(cursor.id) ? cursor.title : null
    }

    const waitingOn = items.filter(i => i.waiting_on === id)
    const linked = items.filter(i => i.people.some(p => p.id === id))

    const decorate = (list: typeof items) =>
      list.map(i => ({ ...i, project: projectOf(i.id) }))

    return NextResponse.json({
      person,
      waiting: decorate(waitingOn.filter(i => i.possession === 'theirs')),
      dropped: decorate(waitingOn.filter(i => i.possession === 'dropped')),
      involved: decorate(linked.filter(i => i.waiting_on !== id)),
    })
  } catch (err) {
    return serverError('people.id.GET', err)
  }
}
