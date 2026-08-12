import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { sendContributorDigest, sendAdminDigest } from '@/lib/email/notify'
import { PORTAL_DISABLED } from '@/lib/portal/status'

/**
 * Contributor and admin digests.
 *
 * Three things were wrong and are fixed here:
 *
 *  1. This route was never registered in vercel.json, so it has never run once.
 *  2. It queried task_assignments, which holds 0 rows. The live data moved to
 *     subtask_assignments (45 rows) in migration 002 and this was never updated,
 *     so even when invoked by hand every contributor looked like they had
 *     nothing assigned.
 *  3. The admin digest read admin_notifications, which was empty because its
 *     trigger was never installed — six subtasks were completed and the owner
 *     was never told about any of them. Migration 010 installs the trigger and
 *     backfills those six.
 */
export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const db = createAdminClient()
  const now = new Date()
  const results: string[] = []

  // ── 1. Contributor digests ──────────────────────────────────────
  //
  // Skipped entirely while the portal is closed: telling someone about work
  // they cannot sign in to look at would be worse than silence.

  if (PORTAL_DISABLED) {
    results.push('contributor digests skipped — portal is paused')
  } else {
    const { data: contributors } = await db
      .from('contributors')
      .select('id, name, email, notif_frequency, last_notified_at')
      .not('email', 'is', null)

    for (const c of contributors ?? []) {
      if (!c.email) continue
      if (!isDue(c.notif_frequency, c.last_notified_at, now)) continue

      // subtask_assignments, not task_assignments.
      const { data: assignments } = await db
        .from('subtask_assignments')
        .select(`
          id, status,
          subtasks ( title, due_date, tasks ( title, projects ( name ) ) )
        `)
        .eq('contributor_id', c.id)
        .in('status', ['pending', 'in_progress'])

      if (!assignments || assignments.length === 0) continue

      try {
        await sendContributorDigest({
          contributor: c,
          assignments: assignments.map((a: Record<string, unknown>) => {
            const subtask = a.subtasks as Record<string, unknown> | null
            const task = subtask?.tasks as Record<string, unknown> | null
            return {
              id: String(a.id),
              status: String(a.status),
              tasks: {
                title: (subtask?.title as string) ?? (task?.title as string) ?? 'Untitled',
                due_date: (subtask?.due_date as string | null) ?? null,
                projects: (task?.projects as { name: string } | null) ?? null,
              },
            }
          }),
          portalUrl: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
        })

        await db.from('contributors')
          .update({ last_notified_at: now.toISOString() })
          .eq('id', c.id)

        results.push(`digest → ${c.email}`)
      } catch (err) {
        results.push(`FAILED ${c.email}: ${err}`)
      }
    }
  }

  // ── 2. Admin digest of unread notifications ─────────────────────

  const adminEmail = process.env.ADMIN_EMAIL ?? process.env.DIGEST_TO
  if (adminEmail) {
    const { data: unread } = await db
      .from('admin_notifications')
      .select(`
        id, type, created_at,
        subtask_assignments (
          status,
          contributors ( name ),
          subtasks ( title, tasks ( title ) )
        )
      `)
      .eq('is_read', false)
      .order('created_at', { ascending: false })

    if (unread && unread.length > 0) {
      try {
        await sendAdminDigest({
          adminEmail,
          notifications: unread.map((n: Record<string, unknown>) => {
            const assignment = n.subtask_assignments as Record<string, unknown> | null
            const subtask = assignment?.subtasks as Record<string, unknown> | null
            return {
              id: String(n.id),
              type: String(n.type),
              created_at: String(n.created_at),
              task_assignments: {
                status: (assignment?.status as string) ?? 'completed',
                contributors: (assignment?.contributors as { name: string } | null) ?? null,
                tasks: { title: (subtask?.title as string) ?? 'a task' },
              },
            }
          }),
          dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/manage`,
        })

        await db.from('admin_notifications').update({ is_read: true }).eq('is_read', false)
        results.push(`admin digest → ${adminEmail} (${unread.length} items)`)
      } catch (err) {
        results.push(`FAILED admin digest: ${err}`)
      }
    } else {
      results.push('admin digest skipped — nothing unread')
    }
  }

  return NextResponse.json({ ok: true, results })
}

function isDue(frequency: string, lastNotified: string | null, now: Date): boolean {
  if (!lastNotified) return true
  const hours = (now.getTime() - new Date(lastNotified).getTime()) / 3_600_000
  switch (frequency) {
    case 'daily': return hours >= 20            // slack for cron drift
    case 'every_other_day': return hours >= 44
    case 'weekly': return hours >= 160
    default: return false
  }
}
