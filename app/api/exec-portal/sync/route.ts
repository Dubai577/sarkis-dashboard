import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { syncExecPortal } from '@/lib/sync/exec-portal'
import { today as todayIso } from '@/lib/dates'

/** POST /api/exec-portal/sync — the manual trigger, owner session required. */
export async function POST(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const feedUrl = process.env.EXEC_PORTAL_FEED_URL
  const token = process.env.EXEC_PORTAL_TOKEN
  if (!feedUrl || !token) {
    return NextResponse.json(
      { error: 'EXEC_PORTAL_FEED_URL or EXEC_PORTAL_TOKEN is not set.' },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(
      await syncExecPortal(createAdminClient(), { feedUrl, token }, todayIso()),
    )
  } catch (err) {
    return serverError('exec-portal.sync.POST', err)
  }
}
