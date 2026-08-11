import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { MAX_TEXT, badRequest, readJson, serverError } from '@/lib/api/http'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const { content } = body
  if (typeof content !== 'string' || !content.trim()) {
    return badRequest('content cannot be empty.')
  }
  if (content.length > MAX_TEXT) {
    return badRequest(`content is too long (max ${MAX_TEXT} characters).`)
  }

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('notes')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

    return NextResponse.json({ note: data })
  } catch (err) {
    return serverError('notes.PATCH', err)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const { id } = await params

  try {
    const db = createAdminClient()
    const { error } = await db.from('notes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError('notes.DELETE', err)
  }
}
