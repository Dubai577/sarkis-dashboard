import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'Invalid PIN format.' }, { status: 400 })
    }

    const db = createAdminClient()

    // pgcrypto crypt() match — no full-table bcrypt scan needed
    const { data, error } = await db
      .rpc('verify_contributor_pin', { entered_pin: pin })

    if (error || !data || data.length === 0) {
      return NextResponse.json({ error: 'Incorrect PIN.' }, { status: 401 })
    }

    const contributor = data[0]

    const response = NextResponse.json({ ok: true, name: contributor.name })
    response.cookies.set('contributor_token', contributor.access_token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/portal',
      maxAge:   60 * 60 * 24 * 30,  // 30 days
    })

    return response
  } catch (err) {
    console.error('[portal/auth]', err)
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}

// Log out
export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('contributor_token', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/portal',
    maxAge:   0,
  })
  return response
}
