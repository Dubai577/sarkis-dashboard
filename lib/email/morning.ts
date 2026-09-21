// Server-only by convention: imported by the morning cron route.
import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, dayName, mediumLabel, weekStart, type IsoDate } from '@/lib/dates'
import { followUpFor, isForeign } from '@/lib/sync/exec-portal'
import { escapeHtml } from '@/lib/email/digest'

/**
 * The morning email: late, today, the rest of the week.
 *
 * The previous digest listed today's todos and stopped. It knew nothing about
 * items with deadlines, nothing about follow-ups, nothing about the week —
 * and it was styled dark, which in most mail clients means a black box in a
 * white inbox. This one shows what the dashboard's Today and This week show,
 * in the same order, so the email and the page agree.
 *
 * Light, one column, 560px: readable on a phone at 8am, which is where it
 * will be read.
 */

interface Row { title: string; meta?: string; tone?: 'late' | 'due' | 'follow' | 'plain' }

const C = {
  ink: '#2A2320', ink2: '#5C5148', ink3: '#8B7C70',
  line: '#E7E0D8', bg: '#FBF9F6', card: '#FFFFFF',
  late: '#A3322F', lateSoft: '#FAE3E1',
  due: '#8A6118', dueSoft: '#F6EBD6',
  follow: '#3F6386', followSoft: '#E2ECF4',
}

const font = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;'

const badge = (text: string, fg: string, bg: string) =>
  `<span style="display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:600;
    letter-spacing:.04em;text-transform:uppercase;color:${fg};background:${bg};white-space:nowrap;">${text}</span>`

const row = (r: Row) => {
  const b =
    r.tone === 'late' ? badge('late', C.late, C.lateSoft)
    : r.tone === 'due' ? badge('due', C.due, C.dueSoft)
    : r.tone === 'follow' ? badge('follow up', C.follow, C.followSoft)
    : ''
  return `
  <tr>
    <td style="padding:9px 12px;border-bottom:1px solid ${C.line};font-size:14px;line-height:1.35;color:${C.ink};${font}">
      ${b ? b + ' ' : ''}${escapeHtml(r.title)}
      ${r.meta ? `<div style="margin-top:2px;font-size:12px;color:${C.ink3};">${escapeHtml(r.meta)}</div>` : ''}
    </td>
  </tr>`
}

const section = (heading: string, colour: string, rows: Row[], emptyText?: string) => {
  if (rows.length === 0 && !emptyText) return ''
  return `
  <h2 style="margin:22px 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${colour};${font}">
    ${heading} <span style="color:${C.ink3};font-weight:500;">${rows.length}</span>
  </h2>
  ${rows.length === 0
    ? `<p style="margin:0;font-size:13px;color:${C.ink3};${font}">${emptyText}</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.line};border-radius:10px;overflow:hidden;">
        ${rows.map(row).join('')}
      </table>`}`
}

const daysBetween = (a: IsoDate, b: IsoDate) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

export async function buildMorningEmail(now: IsoDate, appUrl: string) {
  const db = createAdminClient()
  const thisWeek = weekStart(now)
  const weekEnd = addDays(thisWeek, 6)
  const tomorrow = addDays(now, 1)

  const [{ data: todos }, { data: overdueTodos }, { data: items }] = await Promise.all([
    db.from('todos').select('*')
      .gte('task_date', now).lte('task_date', weekEnd).eq('is_complete', false)
      .order('task_date').order('sort_order'),
    db.from('todos').select('*')
      .lt('week_start', thisWeek).eq('is_complete', false).order('task_date'),
    // '*' on purpose — see lib/db/items.ts.
    db.from('items').select('*').is('archived_at', null),
  ])

  const all = items ?? []
  const byId = new Map(all.map(i => [i.id, i]))
  const parentOf = (id: string | null) => (id ? byId.get(id) : undefined)
  const classOf = (i: { parent_id: string | null }) => {
    // Deepest ancestor only — "MSE 2034 - Elem of Mat Eng", not the chain.
    let cur = parentOf(i.parent_id)
    const guard = new Set<string>()
    while (cur?.parent_id && !guard.has(cur.id)) { guard.add(cur.id); cur = parentOf(cur.parent_id) }
    // the immediate parent is more useful than the root for a class
    return parentOf(i.parent_id)?.title ?? cur?.title ?? ''
  }
  const holds = new Set(all.map(i => i.parent_id).filter(Boolean) as string[])
  const isLeaf = (i: { id: string; is_group?: boolean | null; parent_id: string | null }) =>
    !!i.parent_id && i.is_group !== true && !holds.has(i.id)

  const mirrored = new Set(
    [...(todos ?? []), ...(overdueTodos ?? [])].map(t => t.source_item_id).filter(Boolean) as string[],
  )

  // ── late ──
  const late: Row[] = []
  for (const t of overdueTodos ?? []) {
    const src = t.source_item_id ? byId.get(t.source_item_id) : undefined
    const meant = t.origin_date ?? t.task_date
    late.push({
      title: t.title, tone: 'late',
      meta: [`${daysBetween(meant, now)}d behind`, src ? classOf(src) : ''].filter(Boolean).join(' · '),
    })
  }
  for (const i of all) {
    if (!isLeaf(i) || i.progress === 'done' || mirrored.has(i.id) || isForeign(i, byId)) continue
    if (i.due_date && i.due_date < now) {
      late.push({ title: i.title, tone: 'late',
        meta: [`due ${mediumLabel(i.due_date)} · ${daysBetween(i.due_date, now)}d ago`, classOf(i)].join(' · ') })
    }
  }

  // ── today ──
  const today: Row[] = []
  for (const t of todos ?? []) {
    if (t.task_date !== now) continue
    const src = t.source_item_id ? byId.get(t.source_item_id) : undefined
    const dueIn = src?.due_date ? daysBetween(now, src.due_date) : null
    today.push({
      title: t.title, tone: 'plain',
      meta: [
        t.start_time ? t.start_time.slice(0, 5) : '',
        dueIn !== null ? (dueIn === 0 ? 'due today' : dueIn > 0 ? `due in ${dueIn}d` : `due ${-dueIn}d ago`) : '',
        src ? classOf(src) : '',
      ].filter(Boolean).join(' · '),
    })
  }
  for (const i of all) {
    if (!isLeaf(i) || i.progress === 'done' || mirrored.has(i.id)) continue
    const f = followUpFor(i, byId, now)
    if (f) {
      if (f.date === now) today.push({ title: f.title, tone: 'follow', meta: f.overdue ? 'they are overdue' : `due ${mediumLabel(i.due_date!)}` })
      continue
    }
    if (isForeign(i, byId)) continue
    if (i.planned_date === now || (!i.planned_date && i.due_date === now)) {
      today.push({ title: i.title, tone: i.due_date === now ? 'due' : 'plain',
        meta: [i.due_date && i.due_date !== now ? `due ${mediumLabel(i.due_date)}` : '', classOf(i)].filter(Boolean).join(' · ') })
    }
  }

  // ── the rest of the week, by day ──
  const byDay = new Map<string, Row[]>()
  const put = (d: string, r: Row) => { const l = byDay.get(d) ?? []; l.push(r); byDay.set(d, l) }
  for (const t of todos ?? []) {
    if (t.task_date <= now) continue
    const src = t.source_item_id ? byId.get(t.source_item_id) : undefined
    put(t.task_date, { title: t.title, tone: 'plain', meta: src ? classOf(src) : undefined })
  }
  for (const i of all) {
    if (!isLeaf(i) || i.progress === 'done' || mirrored.has(i.id)) continue
    const f = followUpFor(i, byId, now)
    if (f) { if (f.date > now && f.date <= weekEnd) put(f.date, { title: f.title, tone: 'follow' }); continue }
    if (isForeign(i, byId)) continue
    const d = i.planned_date ?? i.due_date
    if (d && d >= tomorrow && d <= weekEnd) {
      put(d, { title: i.title, tone: i.planned_date ? 'plain' : 'due', meta: classOf(i) || undefined })
    }
  }
  const weekDays = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const weekCount = weekDays.reduce((n, [, rows]) => n + rows.length, 0)

  const weekHtml = weekDays.length === 0
    ? `<p style="margin:0;font-size:13px;color:${C.ink3};${font}">Nothing else dated this week.</p>`
    : weekDays.map(([d, rows]) => `
      <div style="margin:10px 0 4px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.ink2};${font}">
        ${dayName(d)} <span style="color:${C.ink3};font-weight:500;">${mediumLabel(d)} · ${rows.length}</span>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.line};border-radius:10px;overflow:hidden;">
        ${rows.map(row).join('')}
      </table>`).join('')

  const html = `
  <div style="background:${C.bg};padding:24px 12px;">
    <div style="max-width:560px;margin:0 auto;">
      <p style="margin:0 0 2px;font-size:12px;color:${C.ink3};letter-spacing:.06em;text-transform:uppercase;${font}">Merc · ${mediumLabel(now)}</p>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${C.ink};${font}">Good morning</h1>
      <p style="margin:0;font-size:13px;color:${C.ink2};${font}">
        ${today.length} on today${late.length ? ` · <span style="color:${C.late};font-weight:600;">${late.length} late</span>` : ''} · ${weekCount} more this week
      </p>

      ${section('Late', C.late, late)}
      ${section('Today', C.due, today, 'Nothing on today.')}
      <h2 style="margin:22px 0 2px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.ink2};${font}">
        Rest of the week <span style="color:${C.ink3};font-weight:500;">${weekCount}</span>
      </h2>
      ${weekHtml}

      <p style="margin:26px 0 0;font-size:13px;${font}">
        <a href="${appUrl}" style="color:${C.due};font-weight:600;text-decoration:none;">Open the dashboard →</a>
      </p>
    </div>
  </div>`

  const subject = [
    today.length > 0 ? `${today.length} today` : 'Clear today',
    late.length > 0 ? `${late.length} late` : null,
  ].filter(Boolean).join(' · ') + ` — ${mediumLabel(now)}`

  return { subject, html, counts: { today: today.length, late: late.length, week: weekCount } }
}
