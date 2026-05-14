import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

function getToday() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date().getDay()]
}

export async function GET(req) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const weekStart = getWeekStart()
  const today = getToday()

  const { data: todos } = await supabase
    .from('todos')
    .select('*')
    .eq('week_start', weekStart)
    .order('sort_order')

  const todayTasks = todos?.filter(t => t.day_of_week === today) || []
  const rolledOver = todayTasks.filter(t => t.title.includes('(from'))
  const scheduled = todayTasks.filter(t => !t.title.includes('(from'))

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
      <p style="color:#666; margin-top:0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>

      <h2 style="color:#e5e5e5; font-size:16px; margin-top:24px;">📋 Today's Tasks (${todayTasks.length})</h2>
      ${scheduled.length > 0 ? `
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${scheduled.map(taskRow).join('')}
        </table>` : '<p style="color:#666;">No tasks scheduled for today.</p>'}

      ${rolledOver.length > 0 ? `
        <h2 style="color:#fbbf24; font-size:16px; margin-top:24px;">🔄 Rolled Over (${rolledOver.length})</h2>
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${rolledOver.map(taskRow).join('')}
        </table>` : ''}

      ${overdue && overdue.length > 0 ? `
        <h2 style="color:#f87171; font-size:16px; margin-top:24px;">⚠ Overdue from Previous Weeks (${overdue.length})</h2>
        <table style="width:100%; border-collapse:collapse; background:#111; border-radius:8px; overflow:hidden;">
          ${overdue.map(taskRow).join('')}
        </table>` : ''}

      <p style="color:#444; font-size:12px; margin-top:32px; text-align:center;">Sarkis Dashboard · <a href="https://sarkis-dashboard.vercel.app" style="color:#60a5fa;">Open Dashboard</a></p>
    </div>`

  await resend.emails.send({
    from: 'Sarkis Dashboard <onboarding@resend.dev>',
    to: 'brodude028@gmail.com',
    subject: `☀️