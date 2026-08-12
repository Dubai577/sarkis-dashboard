import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { runRollover } from '@/lib/db/rollover'
import { today as todayIso } from '@/lib/dates'

/** POST — run rollover by hand. GET — the recent run log, for diagnosis. */
export async function POST() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ result: await runRollover('manual', todayIso()) })
  } catch (err) {
    return serverError('rollover.POST', err)
  }
}

export async function GET(_req: NextRequest) {
  const denied = await denyUnlessAdmin()
  if (denied) return denied
  try {
    const db = createAdminClient()
    const [{ data: log }, { data: state }] = await Promise.all([
      db.from('rollover_log').select('*').order('ran_at', { ascending: false }).limit(20),
      db.from('rollover_state').select('*').eq('id', true).maybeSingle(),
    ])
    return NextResponse.json({ state, log: log ?? [] })
  } catch (err) {
    return serverError('rollover.GET', err)
  }
}
