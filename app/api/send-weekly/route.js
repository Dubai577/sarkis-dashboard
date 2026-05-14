import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function getWeekStart(offset = 0) {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff + offset * 7)
  return monday.toISOString().split('T')[0]
}

export async function GET(req) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const thisWeek = getWeekStart()
  const nextWeek = getWeekStart(1)

  const { data: thisWeekTodos } = await supabase
    .from('todos').select('*').eq('week_start', thisWeek)

  const { data: nextWeekSarkis } = await supabase
    .from('sarkis_tasks')
    .select('*')
    .eq('status', "Haven't Started")
    .not('planned_date', 'is', null)
    .gte('planned_date', nextWeek)
    .lt('planned_date', getWeekStart(2))

  const completed = thisWeekTodos?.filter(t => t.is_complete) || []
  const incomplete = thisWeekTodos?.filter(t => !t.is_complete) || []

  const taskRow = (t) => `
    <tr>
      <td style="padding:6px 12px; color:#aaa; font-size:13px; border-bottom:1px solid #1a1a1a;">
        ${t.day_of_week ? '<span style="color:#555; min-width:80px; display:inline-block;">' + t.day_of_week.slice(0,3) + '</span>' : ''}
        ${t.title}
        ${t.category ? '<span style="color:#666;"> [' + t.category + ']</span>' : ''}
      </td>
    </tr>`

  const html = `
    <div style="font-family:sans-serif; background:#0a0a0a; color:#e5e5e5; padding:24px; max-width:600px; margin:0 auto; border-radius:12px;">
      <h1 style="color:#a78bfa; margin-bottom:4px;">Weekly Recap 📊</h1>
      <p style="color:#666; margin-top:0;">Week of ${thisWeek}</p>

      <h2 style="color:#4ade80; font-size:16px; margin-top:24px;">✅ Completed This Week (${completed.length})</h2>
      ${completed.length > 0 ? `
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${completed.map(taskRow).join('')}
        </table>` : '<p style="color:#666;">Nothing completed this week.</p>'}

      <h2 style="color:#f87171; font-size:16px; margin-top:24px;">📌 Left Incomplete (${incomplete.length})</h2>
      ${incomplete.length > 0 ? `
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${incomplete.map(taskRow).join('')}
        </table>` : '<p style="color:#666;">Everything done! 🎉</p>'}

      ${nextWeekSarkis && nextWeekSarkis.length > 0 ? `
        <h2 style="color:#60a5fa; font-size:16px; margin-top:24px;">🔮 Coming Next Week from Sarkis (${nextWeekSarkis.length})</h2>
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${nextWeekSarkis.map(t => `
            <tr>
              <td style="padding:6px 12px; color:#aaa; font-size:13px; border-bottom:1px solid #1a1a1a;">
                <span style="color:#555; min-width:80px; display:inline-block;">${t.category || ''}</span>
                ${t.title}
                <span style="color:#666;"> · ${t.planned_date}</span>
              </td>
            </tr>`).join('')}
        </table>` : ''}

      <p style="color:#444; font-size:12px; margin-top:32px; text-align:center;">Sarkis Dashboard · <a href="https://sarkis-dashboard.vercel.app" style="color:#a78bfa;">Open Dashboard</a></p>
    </div>`

  await resend.emails.send({
    from: 'Sarkis Dashboard <onboarding@resend.dev>',
    to: 'brodude028@gmail.com',
    subject: `📊 Weekly Recap — Week of ${thisWeek}`,
    html
  })

  return Response.json({ ok: true })
}