import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, pick, readJson, serverError, validateScalars } from '@/lib/api/http'

const WRITABLE = [
  'title', 'category', 'subcategory', 'priority', 'status',
  'planned_date', 'due_date', 'notes', 'sort_order', 'start_time', 'end_time',
] as const

/** Sort keys the client may ask for, mapped to a column and direction. */
const SORTS = {
  category:     { column: 'category',     ascending: true  },
  status:       { column: 'status',       ascending: true  },
  title:        { column: 'title',        ascending: true  },
  due_date:     { column: 'due_date',     ascending: true  },
  planned_date: { column: 'planned_date', ascending: true  },
  newest:       { column: 'created_at',   ascending: false },
  oldest:       { column: 'created_at',   ascending: true  },
} as const

const STATUSES = ["Haven't Started", 'Working on it', 'Done'] as const

const MAX_ROWS = 500

/**
 * GET /api/sarkis?status=&sort=&search=
 *
 * Filtering, searching and ordering happen in the query rather than in the
 * browser. 'priority' is deliberately absent from SORTS: its stored values do
 * not sort meaningfully (42 of 82 rows are "Soon"), so the client keeps
 * ordering that one case by its own rank map.
 */
export async function GET(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const search = params.get('search')?.trim()
  const sortKey = params.get('sort') ?? 'category'

  if (status && status !== 'All' && !STATUSES.includes(status as typeof STATUSES[number])) {
    return badRequest('Unknown status filter.')
  }
  if (search && search.length > 200) {
    return badRequest('Search text is too long.')
  }

  try {
    const db = createAdminClient()
    let query = db.from('sarkis_tasks').select('*')

    if (status && status !== 'All') query = query.eq('status', status)

    if (search) {
      // Escape PostgREST's or() delimiters so a comma or paren cannot break out
      // of the filter expression.
      const safe = search.replace(/[,()\\*]/g, ' ')
      query = query.or(`title.ilike.%${safe}%,notes.ilike.%${safe}%`)
    }

    const sort = SORTS[sortKey as keyof typeof SORTS] ?? SORTS.category
    query = query
      .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      .limit(MAX_ROWS)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ tasks: data ?? [], truncated: (data?.length ?? 0) >= MAX_ROWS })
  } catch (err) {
    return serverError('sarkis.GET', err)
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
    const { data, error } = await db.from('sarkis_tasks').insert(insert).select().single()
    if (error) throw error
    return NextResponse.json({ task: data }, { status: 201 })
  } catch (err) {
    return serverError('sarkis.POST', err)
  }
}
