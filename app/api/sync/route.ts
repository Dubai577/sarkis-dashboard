import { NextResponse } from 'next/server'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { runSync } from '@/lib/db/sync'
import { today as todayIso } from '@/lib/dates'

export async function POST() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied
  try {
    return NextResponse.json({ result: await runSync(todayIso()) })
  } catch (err) {
    return serverError('sync.POST', err)
  }
}
