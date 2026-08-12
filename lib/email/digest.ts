// Server-only by convention: imported by the cron route handlers.
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, longLabel, mediumLabel, today as todayIso, weekStart, type IsoDate } from '@/lib/dates'
import { possessionOf } from '@/lib/possession'

/**
 * Digest content.
 *
 * Possession is resolved with the same helper the UI uses, so an email can
 * never claim something is fine when the app shows it as dropped.
 */

export interface DigestTodo {
  id: string; title: string; is_complete: boolean; task_date: string
  start_time: string | null; end_time: string | null
  roll_count: number | null; origin_date: string | null
}

const shell = (title: string, subtitle: string, body: string, appUrl: string) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#121110;color:#F0EBE5;padding:24px;max-width:600px;margin:0 auto;border-radius:14px;">
  <h1 style="color:#D2A253;margin:0 0 2px;font-size:20px;">${title}</h1>
  <p style="color:#6E645C;margin:0 0 20px;font-size:13px;">${subtitle}</p>
  ${body}
  <p style="color:#3D3835;font-size:11px;margin-top:28px;text-align:center;">
    <a href="${appUrl}" style="color:#D2A253;text-decoration:none;">Open Merc</a>
  </p>
</div>`

const section = (heading: string, colour: string, rows: string[]) =>
  rows.length === 0 ? '' : `
  <h2 style="color:${colour};font-size:13px;text-transform:uppercase;letter-spacing:.06em;margin:22px 0 8px;">
    ${heading} <span style="color:#6E645C;">${rows.length}</span>
  </h2>
  <table style="width:100%;border-collapse:collapse;background:#1C1A18;border-radius:8px;overflow:hidden;">
    ${rows.join('')}
  </table>`

const line = (text: string, meta?: string, strike = false) => `
  <tr><td style="padding:8px 12px;border-bottom:1px solid #2E2A27;font-size:14px;">
    ${strike ? `<s style="color:#6E645C">${escapeHtml(text)}</s>` : escapeHtml(text)}
    ${meta ? `<span style="color:#6E645C;font-size:12px;"> ${escapeHtml(meta)}</span>` : ''}
  </td></tr>`

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function todoMeta(t: DigestTodo): string {
  const bits: string[] = []
  if (t.start_time) bits.push(t.start_time + (t.end_time ? `–${t.end_time}` : ''))
  // Rendered from origin_date, never read out of the title.
  if (t.roll_count && t.origin_date && t.origin_date !== t.task_date) {
    bits.push(`from ${mediumLabel(t.origin_date)}`)
  }
  if ((t.roll_count ?? 0) >= 3) bits.push(`rolled ${t.roll_count}×`)
  return bits.join(' · ')
}

// ── morning ──────────────────────────────────────────────────────

export async function buildMorningDigest(now: IsoDate, appUrl: string) {
  const db = createAdminClient()
  const thisWeek = weekStart(now)

  const [{ data: todayTodos }, { data: overdue }, { data: items }, { data: people }] =
    await Promise.all([
      db.from('todos').select('*').eq('task_date', now).order('sort_order'),
      db.from('todos').select('*').lt('week_start', thisWeek).eq('is_complete', false).order('task_date'),
      db.from('items').select('id,title,waiting_on,waiting_since,nudge_after').is('archived_at', null).not('waiting_on', 'is', null),
      db.from('people').select('id,name'),
    ])

  const nameOf = new Map((people ?? []).map(p => [p.id, p.name]))
  const dropped = (items ?? []).filter(i => possessionOf(i, now) === 'dropped')

  const open = (todayTodos ?? []).filter(t => !t.is_complete) as DigestTodo[]

  const body = [
    section('Needs a nudge', '#D97C7C', dropped.map(i =>
      line(i.title, `waiting on ${nameOf.get(i.waiting_on!) ?? 'someone'}`))),
    section('Late', '#D97C7C', (overdue ?? []).map(t =>
      line(t.title, mediumLabel(t.task_date)))),
    section('On today', '#D2A253', open.map(t => line(t.title, todoMeta(t)))),
    open.length === 0 && dropped.length === 0 && (overdue ?? []).length === 0
      ? '<p style="color:#6E645C;font-size:14px;">Nothing scheduled and nothing waiting. Genuinely clear.</p>'
      : '',
  ].join('')

  return {
    subject: `${open.length > 0 ? `${open.length} today` : 'Clear today'}${dropped.length ? ` · ${dropped.length} needs a nudge` : ''} — ${mediumLabel(now)}`,
    html: shell('Good morning', longLabel(now), body, appUrl),
    counts: { today: open.length, overdue: (overdue ?? []).length, dropped: dropped.length },
  }
}

// ── weekly recap ─────────────────────────────────────────────────

/**
 * The real recap. The previous handler was a byte-for-byte copy of the morning
 * digest — it greeted you "Good morning" and listed today's tasks.
 *
 * Fired Sunday evening, it summarises the week that is ENDING, which is the
 * week containing today.
 */
export async function buildWeeklyRecap(now: IsoDate, appUrl: string) {
  const db = createAdminClient()
  const start = weekStart(now)
  const end = addDays(start, 6)
  const nextStart = addDays(start, 7)
  const nextEnd = addDays(nextStart, 6)

  const [{ data: week }, { data: next }, { data: overdue }, { data: items }, { data: people }] =
    await Promise.all([
      db.from('todos').select('*').gte('task_date', start).lte('task_date', end).order('task_date'),
      db.from('todos').select('*').gte('task_date', nextStart).lte('task_date', nextEnd).order('task_date'),
      db.from('todos').select('*').lt('week_start', start).eq('is_complete', false),
      db.from('items').select('id,title,waiting_on,waiting_since,nudge_after').is('archived_at', null).not('waiting_on', 'is', null),
      db.from('people').select('id,name'),
    ])

  const rows = (week ?? []) as DigestTodo[]
  const done = rows.filter(t => t.is_complete)
  const left = rows.filter(t => !t.is_complete)
  const nameOf = new Map((people ?? []).map(p => [p.id, p.name]))
  const dropped = (items ?? []).filter(i => possessionOf(i, now) === 'dropped')

  const rate = rows.length > 0 ? Math.round((done.length / rows.length) * 100) : null

  const body = [
    `<p style="color:#A79C92;font-size:14px;margin:0 0 4px;">
       ${done.length} of ${rows.length} done${rate !== null ? ` · ${rate}%` : ''}
     </p>`,
    section('Finished', '#79BCA6', done.map(t => line(t.title, t.task_date.slice(5), true))),
    section('Still open', '#D2A253', left.map(t => line(t.title, todoMeta(t)))),
    section('Needs a nudge', '#D97C7C', dropped.map(i =>
      line(i.title, `waiting on ${nameOf.get(i.waiting_on!) ?? 'someone'}`))),
    section('Still late', '#D97C7C', (overdue ?? []).map(t => line(t.title, mediumLabel(t.task_date)))),
    section('Next week', '#8FB2D0', (next ?? []).map(t => line(t.title, mediumLabel(t.task_date)))),
    rows.length === 0
      ? '<p style="color:#6E645C;font-size:14px;">Nothing was scheduled this week.</p>'
      : '',
  ].join('')

  return {
    subject: `Week in review — ${done.length}/${rows.length} done`,
    html: shell('Week in review', `${longLabel(start)} – ${longLabel(end)}`, body, appUrl),
    counts: { done: done.length, left: left.length, dropped: dropped.length },
  }
}

// ── reminders ────────────────────────────────────────────────────

/**
 * Configurable reminders, from the user's own list: "2 days, 1 week, fully
 * customizable", plus reminders about undated items or a whole category on a
 * chosen day.
 *
 * Built into the digest rather than sent as separate mail — a reminder that
 * arrives as its own email at 7am is just another thing to dismiss.
 *
 * last_sent_on makes each reminder idempotent per day, so a retried cron cannot
 * send twice.
 */
export async function buildReminderSection(now: IsoDate) {
  const db = createAdminClient()

  const { data: reminders } = await db
    .from('reminders').select('*').eq('is_active', true)

  if (!reminders || reminders.length === 0) return { html: '', due: [] as string[] }

  const [{ data: items }, { data: sweat }, { data: categories }] = await Promise.all([
    db.from('items').select('id,title,planned_date,due_date,category_id').is('archived_at', null),
    db.from('sweat_tasks').select('id,title,course,my_due_date,actual_due_date').eq('is_complete', false),
    db.from('categories').select('id,name'),
  ])

  const itemById = new Map((items ?? []).map(i => [i.id, i]))
  const sweatById = new Map((sweat ?? []).map(s => [s.id, s]))
  const catById = new Map((categories ?? []).map(c => [c.id, c]))

  const lines: string[] = []
  const due: string[] = []

  for (const r of reminders) {
    if (r.last_sent_on === now) continue

    let fires = false
    let text = ''

    if (r.kind === 'absolute') {
      fires = r.fire_on === now
      if (r.item_id) text = itemById.get(r.item_id)?.title ?? ''
      else if (r.sweat_id) {
        const s = sweatById.get(r.sweat_id)
        text = s ? `${s.course}: ${s.title}` : ''
      } else if (r.category_id) {
        const cat = catById.get(r.category_id)
        const open = (items ?? []).filter(i => i.category_id === r.category_id).length
        text = cat ? `${cat.name} — ${open} open` : ''
      }
    } else {
      // offset: fire N days before the target's date
      const target = r.item_id
        ? itemById.get(r.item_id)?.due_date ?? itemById.get(r.item_id)?.planned_date ?? null
        : r.sweat_id
          ? sweatById.get(r.sweat_id)?.actual_due_date ?? sweatById.get(r.sweat_id)?.my_due_date ?? null
          : null

      if (target) {
        fires = addDays(target, -(r.offset_days ?? 0)) === now
        const label = r.item_id
          ? itemById.get(r.item_id)?.title
          : `${sweatById.get(r.sweat_id!)?.course}: ${sweatById.get(r.sweat_id!)?.title}`
        text = `${label} — ${r.offset_days === 0 ? 'today' : `in ${r.offset_days} day${r.offset_days === 1 ? '' : 's'}`}`
      }
    }

    if (fires && text) {
      lines.push(line(text, r.note ?? undefined))
      due.push(r.id)
    }
  }

  return { html: section('Reminders', '#8FB2D0', lines), due }
}

export async function markRemindersSent(ids: string[], now: IsoDate) {
  if (ids.length === 0) return
  const db = createAdminClient()
  await db.from('reminders').update({ last_sent_on: now }).in('id', ids)
}
