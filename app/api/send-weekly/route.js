import { Resend } from 'resend'
import { denyUnlessCron } from '@/lib/auth/guard'
import { today as todayIso } from '@/lib/dates'
import { buildWeeklyRecap } from '@/lib/email/digest'

const RECIPIENT = process.env.DIGEST_TO ?? 'brodude028@gmail.com'
const FROM = process.env.EMAIL_FROM ?? 'Merc <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'

/**
 * Sunday evening recap.
 *
 * This used to be a byte-for-byte copy of the morning digest: it greeted you
 * "Good morning" and listed today's tasks. It now reports the week that is
 * ending — finished, still open, needing a nudge, and what is already on next
 * week.
 *
 * The schedule runs Sunday evening Eastern. The old one fired at 00:00 UTC
 * Monday and resolved "today" in UTC, so it summarised the empty upcoming week.
 */
export async function GET(req) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const now = todayIso()
  const recap = await buildWeeklyRecap(now, APP_URL)

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: FROM,
    to: RECIPIENT,
    subject: recap.subject,
    html: recap.html,
  })

  return Response.json({ ok: true, sentTo: RECIPIENT, date: now, counts: recap.counts })
}
