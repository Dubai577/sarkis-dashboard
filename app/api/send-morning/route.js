import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import {
  currentWeekStart,
  dayName,
  easternHour,
  longLabel,
  mediumLabel,
  today as todayIso,
} from '@/lib/dates'

const RECIPIENT = process.env.DIGEST_TO ?? 'brodude028@gmail.com'
const FROM = process.env.EMAIL_FROM ?? 'Merc Dashboard <onboarding@resend.dev>'

export async function GET(req) {
  // Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations.
  // This endpoint sends email, so it must never be callable without it.
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const supabase = createAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Eastern, not UTC. The server runs in UTC, so `new Date().getDay()` here
  // would be the UTC weekday — which is how the Sunday recap used to compute
  // Monday and report an empty upcoming week.
  const now = new Date()
  const date = todayIso(now)
  const weekStart = currentWeekStart(now)
  const today = dayName(date)

  const { data: todos } = await supabase
    .from('todos')
    .select('*')
    .eq('week_start', weekStart)
    .order('sort_order')

  const todayTasks = todos?.filter(t => t.day_of_week === today) || []

  const { data: overdue } = await supabase
    .from('todos')
    .select('*')
    .lt('week_start', weekStart)
    .eq('is_complete', false)

  const taskRow = (t) => `
    <tr>
      <td style="padding:6px 12px; border-bottom:1px solid #2a2a2a;">
        ${t.is_complete ? '<s style="color:#666">' + t.title + '</s>' : t.title}
        ${t.category ? '<span style="color:#888; font-size:12px;"> [' + t.category + ']</span>' : ''}
        ${t.start_time ? '<span style="color:#60a5fa; font-size:12px;"> @' + t.start_time + (t.end_time ? '-' + t.end_time : '') + '</span>' : ''}
      </td>
    </tr>`

  const html = `
    <div style="font-family:sans-serif; background:#0a0a0a; color:#e5e5e5; padding:24px; max-width:600px; margin:0 auto; border-radius:12px;">
      <h1 style="color:#60a5fa; margin-bottom:4px;">Good morning 🌅</h1>
      <p style="color:#666; margin-top:0;">${longLabel(date)}</p>

      <h2 style="color:#e5e5e5; font-size:16px; margin-top:24px;">📋 Today's Tasks (${todayTasks.length})</h2>
      ${todayTasks.length > 0 ? `
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${todayTasks.map(taskRow).join('')}
        </table>` : '<p style="color:#666;">No tasks scheduled for today.</p>'}

      ${overdue && overdue.length > 0 ? `
        <h2 style="color:#f87171; font-size:16px; margin-top:24px;">⚠ Overdue from Previous Weeks (${overdue.length})</h2>
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${overdue.map(taskRow).join('')}
        </table>` : ''}

      <p style="color:#444; font-size:12px; margin-top:32px; text-align:center;">Merc Dashboard · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'}" style="color:#60a5fa;">Open Dashboard</a></p>
    </div>`

  await resend.emails.send({
    from: FROM,
    to: RECIPIENT,
    subject: `☀️ ${today}'s Tasks — ${mediumLabel(date)}`,
    html,
  })

  return Response.json({ ok: true, sentTo: RECIPIENT, date, easternHour: easternHour(now) })
}
