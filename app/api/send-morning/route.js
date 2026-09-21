import { Resend } from 'resend'
import { denyUnlessCron } from '@/lib/auth/guard'
import { today as todayIso } from '@/lib/dates'
import { buildMorningEmail } from '@/lib/email/morning'
import { runRollover } from '@/lib/db/rollover'
import { runSync } from '@/lib/db/sync'

/**
 * Morning email, and the day's maintenance.
 *
 * Rollover and the todo sync run first so the email reflects today's real
 * state; both are idempotent, so the on-open catch-up cannot double-process.
 *
 * The sender is Resend's sandbox address unless EMAIL_FROM names a verified
 * domain. The sandbox can only deliver to the Resend account's own login
 * email, and a gmail.com sender is refused outright — so the recipient falls
 * back through DIGEST_TO, then ADMIN_EMAIL, and a failed send is REPORTED in
 * the response rather than swallowed. A morning email that silently fails
 * for a week is worse than one that says why.
 */
const FROM = (() => {
  const v = process.env.EMAIL_FROM ?? ''
  // Resend cannot send from a free-mail domain; that only produces 403s.
  if (!v || /@(gmail|yahoo|hotmail|outlook|icloud)\.com>?$/i.test(v)) return 'Merc <onboarding@resend.dev>'
  return v
})()
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'

export async function GET(req) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const to = process.env.DIGEST_TO ?? process.env.ADMIN_EMAIL
  if (!to) return Response.json({ ok: false, error: 'No DIGEST_TO or ADMIN_EMAIL set.' }, { status: 500 })

  const now = todayIso()
  const rollover = await runRollover('cron', now)
  const sync = await runSync(now)
  const email = await buildMorningEmail(now, APP_URL)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { data, error } = await resend.emails.send({ from: FROM, to, subject: email.subject, html: email.html })

  if (error) {
    console.error('[send-morning] delivery failed', JSON.stringify(error))
    return Response.json({ ok: false, sentTo: to, from: FROM, error, counts: email.counts }, { status: 502 })
  }

  return Response.json({
    ok: true,
    id: data?.id,
    sentTo: to,
    from: FROM,
    date: now,
    counts: email.counts,
    rollover: { moved: rollover.moved, merged: rollover.merged, days: rollover.daysWalked },
    sync: { created: sync.created, moved: sync.moved },
  })
}
