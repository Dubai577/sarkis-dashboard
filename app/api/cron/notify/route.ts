import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendContributorDigest, sendAdminDigest } from '@/lib/email/notify'

// Vercel Cron — runs daily at midnight UTC
// vercel.json: { "crons": [{ "path": "/api/cron/notify", "schedule": "0 0 * * *" }] }

export async function GET(req: NextRequest) {
  // Guard against non-Vercel calls in production
  const authHeader = req.headers.get('authorization')
  if (
    process.env.NODE_ENV === 'production' &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db  = createAdminClient()
  const now = new Date()
  const results: string[] = []

  // ── 1. Contributor digests ──────────────────────────────────────

  const { data: contributors } = await db
    .from('contributors')
    .select('id, name, email, notif_frequency, last_notified_at')
    .not('email', 'is', null)

  for (const c of contributors ?? []) {
    if (!c.email) continue

    // Check if this contributor is due for a notification
    if (!isDue(c.notif_frequency, c.last_notified_at, now)) continue

    // Fetch their pending/in_progress tasks
    const { data: assignments } = await db
      .from('task_assignments')
      .select(`
        id, status,
        tasks ( title, due_date, projects ( name ) )
      `)
      .eq('contributor_id', c.id)
      .in('status', ['pending', 'in_progress'])

    if (!assignments || assignments.length === 0) continue

    try {
      await sendContributorDigest({
        contributor:  c,
        assignments:  assignments as any[],
        portalUrl:    `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
      })

      await db
        .from('contributors')
        .update({ last_notified_at: now.toISOString() })
        .eq('id', c.id)

      results.push(`✓ digest → ${c.email}`)
    } catch (err) {
      results.push(`✗ digest → ${c.email}: ${err}`)
    }
  }

  // ── 2. Admin digest of unread notifications ─────────────────────

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    const { data: unread } = await db
      .from('admin_notifications')
      .select(`
        id, type, created_at,
        task_assignments (
          status,
          tasks ( title ),
          contributors ( name )
        )
      `)
      .eq('is_read', false)
      .order('created_at', { ascending: false })

    if (unread && unread.length > 0) {
      try {
        await sendAdminDigest({
          adminEmail,
          notifications: unread as any[],
          dashboardUrl:  `${process.env.NEXT_PUBLIC_APP_URL}/projects`,
        })
        // Mark all as read
        await db
          .from('admin_notifications')
          .update({ is_read: true })
          .eq('is_read', false)

        results.push(`✓ admin digest → ${adminEmail} (${unread.length} items)`)
      } catch (err) {
        results.push(`✗ admin digest: ${err}`)
      }
    }
  }

  return NextResponse.json({ ok: true, sent: results })
}

function isDue(
  frequency:       string,
  lastNotified:    string | null,
  now:             Date
): boolean {
  if (!lastNotified) return true
  const last      = new Date(lastNotified)
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  switch (frequency) {
    case 'daily':          return hoursSince >= 20   // 20h buffer for cron drift
    case 'every_other_day': return hoursSince >= 44
    case 'weekly':         return hoursSince >= 160
    default:               return false
  }
}
