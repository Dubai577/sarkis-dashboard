import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { MAX_TEXT, badRequest, isIsoDate, readJson, serverError } from '@/lib/api/http'
import { insertItems, splitPreview } from '@/lib/db/items'

/**
 * POST /api/capture — the most-used path in the app.
 *
 * One text field, no required anything, and it never asks whether the thing is
 * a project or a task. That question at the moment of typing is exactly what
 * stops things being captured: 5 projects exist in the app against 15+ in real
 * life, and the barrier was the creation form.
 *
 * Default target is a note — the inbox. Everything else is opt-in:
 *   target 'note'  (default) a raw note, filed later
 *   target 'item'  straight into the tree, optionally under a parent
 *   target 'todo'  straight onto a date
 */
export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return badRequest('Nothing to capture.')
  if (text.length > MAX_TEXT) return badRequest('That is too long to capture in one go.')

  const target = body.target === 'item' || body.target === 'todo' ? body.target : 'note'

  try {
    const db = createAdminClient()

    if (target === 'todo') {
      if (!isIsoDate(typeof body.task_date === 'string' ? body.task_date : null)) {
        return badRequest('task_date must be a YYYY-MM-DD date.')
      }
      const { data, error } = await db
        .from('todos')
        .insert({
          title: text,
          task_date: body.task_date,
          // Chosen deliberately, so rollover leaves it alone while it is future.
          placement: 'manual',
          origin_date: body.task_date,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ kind: 'todo', todo: data }, { status: 201 })
    }

    if (target === 'item') {
      const insert: Record<string, unknown> = { title: text }
      // A deliberately-created project is pinned, otherwise it is made and then
      // immediately invisible on a board that only surfaces what looks hot.
      if (body.board === 'pinned' || body.board === 'muted' || body.board === 'auto') {
        insert.board = body.board
      }
      if (body.is_group === true) insert.is_group = true
      if (typeof body.parent_id === 'string') insert.parent_id = body.parent_id
      if (typeof body.category_id === 'string') insert.category_id = body.category_id
      if (isIsoDate(typeof body.planned_date === 'string' ? body.planned_date : null)) {
        insert.planned_date = body.planned_date
      }
      if (typeof body.waiting_on === 'string') {
        insert.waiting_on = body.waiting_on
        insert.waiting_since = new Date().toISOString().slice(0, 10)
      }

      const [data] = (await insertItems(db, [insert])) ?? []
      if (!data) throw new Error('The item did not come back from the insert.')

      if (typeof body.waiting_on === 'string') {
        await db.from('item_people')
          .upsert({ item_id: data.id, person_id: body.waiting_on, relation: 'waiting_on' })
      }

      return NextResponse.json({ kind: 'item', item: data, split: splitPreview(text) }, { status: 201 })
    }

    const { data, error } = await db.from('notes').insert({ content: text }).select().single()
    if (error) throw error

    return NextResponse.json(
      { kind: 'note', note: data, split: splitPreview(text) },
      { status: 201 },
    )
  } catch (err) {
    return serverError('capture.POST', err)
  }
}
