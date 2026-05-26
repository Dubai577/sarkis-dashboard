import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

function getToken() {
  return cookies().get('contributor_token')?.value
}

export async function PATCH(req: NextRequest) {
  const token = getToken()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, notif_frequency } = await req.json()
  const validFreqs = ['daily', 'every_other_day', 'weekly']
  if (notif_frequency && !validFreqs.includes(notif_frequency)) {
    return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 })
  }

  const db = createAdminClient()
  const patch: Record<string, unknown> = {}
  if (email !== undefined)           patch.email           = email || null
  if (notif_frequency !== undefined) patch.notif_frequency = notif_frequency

  const { error } = await db
    .from('contributors')
    .update(patch)
    .eq('access_token', token)

  if (error) return NextResponse.json({ error: 'Failed.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
