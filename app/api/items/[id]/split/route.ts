import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { badRequest, readJson, serverError } from '@/lib/api/http'
import { splitPreview } from '@/lib/db/items'

/**
 * POST /api/items/[id]/split
 *
 * Turns a title that is really a list into a parent with children:
 *   "Motor mounts, balljoint, windshield can, exhaust hanger"  →  4 children
 *
 * The caller sends the exact child titles it previewed, so what is committed is
 * always what was shown — the server never re-splits and produces something
 * different from the preview the user approved.
 *
 * The original title is preserved in notes, because the split is a guess about
 * punctuation and the full original is the only way back.
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

  const { parent_title, children } = body

  if (!Array.isArray(children) || children.length < 2) {
    return badRequest('A split needs at least two children.')
  }
  if (children.length > 40) {
    return badRequest('That would create more than 40 children.')
  }
  if (!children.every(c => typeof c === 'string' && c.trim().length > 0)) {
    return badRequest('Every child needs a title.')
  }

  try {
    const db = createAdminClient()

    const { data: parent, error: readErr } = await db
      .from('items')
      .select('id,title,notes,category_id,parent_id')
      .eq('id', id)
      .single()

    if (readErr) throw readErr
    if (!parent) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    const { data: created, error: insertErr } = await db
      .from('items')
      .insert(
        children.map((title: string, index: number) => ({
          parent_id: id,
          title: title.trim(),
          category_id: parent.category_id,
          sort_order: index,
        })),
      )
      .select()

    if (insertErr) throw insertErr

    const newTitle =
      typeof parent_title === 'string' && parent_title.trim()
        ? parent_title.trim()
        : parent.title

    const keptOriginal =
      parent.title === newTitle
        ? parent.notes
        : [parent.notes, `Split from: ${parent.title}`].filter(Boolean).join('\n\n')

    const { data: updated, error: updateErr } = await db
      .from('items')
      .update({ title: newTitle, notes: keptOriginal })
      .eq('id', id)
      .select()
      .single()

    if (updateErr) throw updateErr

    return NextResponse.json({ item: updated, children: created }, { status: 201 })
  } catch (err) {
    return serverError('items.split', err)
  }
}

/** GET — preview only, so the client can show the result before committing. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params

  try {
    const db = createAdminClient()
    const { data } = await db.from('items').select('title').eq('id', id).single()
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    return NextResponse.json(splitPreview(data.title))
  } catch (err) {
    return serverError('items.split.GET', err)
  }
}
