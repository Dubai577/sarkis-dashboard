import { Resend } from 'resend'
import { denyUnlessCron } from '@/lib/auth/guard'
import { today as todayIso } from '@/lib/dates'
import { buildMorningDigest, buildReminderSection, markRemindersSent } from '@/lib/email/digest'
import { runRollover } from '@/lib/db/rollover'
import { runSync } from '@/lib/db/sync'

const RECIPIENT = process.env.DIGEST_TO ?? 'brodude028@gmail.com'
const FROM = process.env.EMAIL_FROM ?? 'Merc <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'

/**
 * Morning digest, and the day's maintenance.
 *
 * Rollover runs here rather than as its own cron because Vercel Hobby allows
 * one run per job per day and only two jobs. The digest reads the result, so
 * rollover must happen first — and it is idempotent, so the lazy catch-up path
 * on app open cannot double-process what this already walked.
 */
export async function GET(req) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const now = todayIso()

  // Maintenance before content, so the email reflects today's real state.
  const rollover = await runRollover('cron', now)
  const sync = await runSync(now)

  const digest = await buildMorningDigest(now, APP_URL)
  const reminders = await buildReminderSection(now)

  const html = digest.html.replace(
    '<p style="color:#3D3835',
    reminders.html + '<p style="color:#3D3835',
  )

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: FROM,
    to: RECIPIENT,
    subject: digest.subject,
    html,
  })

  await markRemindersSent(reminders.due, now)

  return Response.json({
    ok: true,
    sentTo: RECIPIENT,
    date: now,
    counts: digest.counts,
    reminders: reminders.due.length,
    rollover: { moved: rollover.moved, merged: rollover.merged, days: rollover.daysWalked },
    sync: { created: sync.created },
  })
}
