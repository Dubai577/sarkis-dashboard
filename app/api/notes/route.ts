import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { MAX_TEXT, badRequest, readJson, serverError } from '@/lib/api/http'

export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('notes').select('*').order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ notes: data ?? [] })
  } catch (err) {
    return serverError('notes.GET', err)
  }
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const body = await readJson(req)
  if (!body) return badRequest('Expected a JSON object.')

  const { content } = body
  if (typeof content !== 'string' || !content.trim()) {
    return badRequest('content is required.')
  }
  if (content.length > MAX_TEXT) {
    return badRequest(`content is too long (max ${MAX_TEXT} characters).`)
  }

  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('notes').insert({ content: content.trim() }).select().single()

    if (error) throw error
    return NextResponse.json({ note: data }, { status: 201 })
  } catch (err) {
    return serverError('notes.POST', err)
  }
}
