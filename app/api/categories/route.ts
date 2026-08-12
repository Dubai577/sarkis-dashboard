import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'

/** The single source of category colour. Every surface reads this. */
export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  try {
    const db = createAdminClient()
    const { data, error } = await db.from('categories').select('*').order('sort_order')
    if (error) throw error
    return NextResponse.json({ categories: data ?? [] })
  } catch (err) {
    return serverError('categories.GET', err)
  }
}
