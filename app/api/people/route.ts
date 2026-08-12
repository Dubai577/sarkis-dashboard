import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'
import { loadItemViews } from '@/lib/db/items'

const WRITABLE = ['name', 'email', 'phone', 'role_name', 'notes'] as const

/** GET /api/people — everyone, with how much of their work is open or waiting. */
export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  try {
    const db = createAdminClient()
    const [{ data: people, error }, items] = await Promise.all([
      db.from('people').select('*').order('name'),
      loadItemViews(),
    ])
    if (error) throw error

    const byId = new Map(items.map(i => [i.id, i]))
    const counts = new Map<string, { open: number; waiting: number; dropped: number }>()

    const bump = (personId: string, key: 'open' | 'waiting' | 'dropped') => {
      const entry = counts.get(personId) ?? { open: 0, waiting: 0, dropped: 0 }
      entry[key] += 1
      counts.set(personId, entry)
    }

    for (const item of items) {
      for (const link of item.people) bump(link.id, 'open')
      if (item.waiting_on && byId.has(item.id)) {
        bump(item.waiting_on, item.possession === 'dropped' ? 'dropped' : 'waiting')
      }
    }

    return NextResponse.json({
      people: (people ?? []).map(p => ({
        ...p,
        ...(counts.get(p.id) ?? { open: 0, waiting: 0, dropped: 0 }),
      })),
    })
  } catch (err) {
    return serverError('people.GET', err)
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

  if (typeof insert.name !== 'string' || !insert.name.trim()) {
    return badRequest('name is required.')
  }
  // Names double as a lookup key and people.name carries a lower(name) unique
  // index, so a stray space would create a silent duplicate.
  insert.name = insert.name.trim()

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('people').insert(insert).select().single()
    if (error) {
      if (error.code === '23505') return badRequest('Someone with that name already exists.')
      throw error
    }
    return NextResponse.json({ person: data }, { status: 201 })
  } catch (err) {
    return serverError('people.POST', err)
  }
}
