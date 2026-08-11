import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { currentWeekStart, longLabel, mediumLabel, today as todayIso } from '@/lib/dates'

/**
 * Sunday evening recap.
 *
 * Release 1 fixes only the date handling. Fired at 00:00 UTC Monday, the old
 * handler resolved "today" in UTC and therefore reported Monday's empty week
 * instead of the week that had just ended. The schedule now runs Sunday
 * evening Eastern and the week is resolved in Eastern.
 *
 * The body is still a summary of the week's rows rather than a genuine
 * completed/outstanding/upcoming recap — that is Release 4, together with the
 * contributor digest and the admin notifications.
 */

const RECIPIENT = process.env.DIGEST_TO ?? 'brodude028@gmail.com'
const FROM = process.env.EMAIL_FROM ?? 'Merc Dashboard <onboarding@resend.dev>'

export async function GET(req) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const supabase = createAdminClient()
  const resend = new Resend(process.env.RESEND_API_KEY)

  const now = new Date()
  const date = todayIso(now)
  const weekStart = currentWeekStart(now)

  const { data: todos } = await supabase
    .from('todos')
    .select('*')
    .eq('week_start', weekStart)
    .order('sort_order')

  const all = todos ?? []
  const done = all.filter(t => t.is_complete)
  const left = all.filter(t => !t.is_complete)

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
        <span style="color:#555; font-size:12px;"> ${t.day_of_week}</span>
      </td>
    </tr>`

  const section = (heading, colour, rows) => rows.length > 0 ? `
    <h2 style="color:${colour}; font-size:16px; margin-top:24px;">${heading} (${rows.length})</h2>
    <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
      ${rows.map(taskRow).join('')}
    </table>` : ''

  const html = `
    <div style="font-family:sans-serif; background:#0a0a0a; color:#e5e5e5; padding:24px; max-width:600px; margin:0 auto; border-radius:12px;">
      <h1 style="color:#60a5fa; margin-bottom:4px;">Week in review</h1>
      <p style="color:#666; margin-top:0;">Week of ${longLabel(weekStart)} · ${done.length}/${all.length} done</p>

      ${section('✅ Completed', '#4ade80', done)}
      ${section('↩ Still open', '#fbbf24', left)}
      ${section('⚠ Overdue from previous weeks', '#f87171', overdue ?? [])}

      ${all.length === 0 ? '<p style="color:#666;">Nothing was scheduled this week.</p>' : ''}

      <p style="color:#444; font-size:12px; margin-top:32px; text-align:center;">Merc Dashboard · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'}" style="color:#60a5fa;">Open Dashboard</a></p>
    </div>`

  await resend.emails.send({
    from: FROM,
    to: RECIPIENT,
    subject: `📆 Week in review — ${mediumLabel(weekStart)}`,
    html,
  })

  return Response.json({ ok: true, sentTo: RECIPIENT, weekStart, date })
}
