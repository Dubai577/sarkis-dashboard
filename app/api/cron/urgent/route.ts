import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessCron } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { today as todayIso } from '@/lib/dates'
import { isForeign, followUpFor } from '@/lib/sync/exec-portal'
import { addDays } from '@/lib/dates'

/**
 * The evening check: what is due tonight and still not done.
 *
 * Deliberately silent when there is nothing to say. A nightly email that
 * mostly reads "nothing urgent" trains you to stop opening it, and then the
 * one night it matters it goes unread with the rest. No email is the correct
 * output for a night with nothing outstanding.
 */

const FROM = process.env.EMAIL_FROM ?? 'Merc <onboarding@resend.dev>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://merc-dashboard-dubai577.vercel.app'

export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  const to = process.env.DIGEST_TO ?? process.env.ADMIN_EMAIL
  if (!to) return NextResponse.json({ skipped: 'No DIGEST_TO or ADMIN_EMAIL set.' })

  try {
    const db = createAdminClient()
    const now = todayIso()

    /**
     * Filtered here, not in the query.
     *
     * `.neq('progress', 'done')` looks right and is wrong: in SQL, NULL is not
     * equal to anything, so a row never marked at all fails a NOT-EQUAL test
     * and disappears. That would silently exclude every task nobody has
     * touched — which is precisely the set this email exists to report.
     */
    const { data: all, error } = await db
      .from('items')
      .select('id,title,due_date,progress,parent_id,external_source,external_uid,follow_up_on')
      .is('archived_at', null)
    if (error) throw error

    const byId = new Map((all ?? []).map(r => [r.id, r]))
    const urgent = (all ?? [])
      .filter(i => i.due_date && i.due_date <= now && i.progress !== 'done')
      // A teammate's exec-portal deadline is theirs to be emailed about.
      .filter(i => !isForeign(i, byId))
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

    /**
     * Teammates' tasks due tomorrow, and any already overdue and still open on
     * the portal. Not "urgent" in the sense above — not yours to do — but the
     * evening is when you decide who to message in the morning.
     */
    const tomorrow = addDays(now, 1)
    const followUps = (all ?? [])
      .map(i => followUpFor(i, byId, now))
      .filter((f): f is NonNullable<typeof f> => !!f && f.date <= tomorrow)
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.person.localeCompare(b.person))

    if (urgent.length === 0 && followUps.length === 0) {
      return NextResponse.json({ ok: true, sent: false, reason: 'nothing outstanding', checked: all?.length ?? 0 })
    }

    const line = (i: typeof urgent[number]) => {
      const parent = i.parent_id ? byId.get(i.parent_id) : undefined
      const late = i.due_date! < now
      return `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #E7E0D8;font:14px system-ui">
          ${escapeHtml(i.title)}
          ${parent ? `<span style="color:#8B7C70;font-size:12px"> · ${escapeHtml(parent.title)}</span>` : ''}
        </td>
        <td style="padding:6px 0;border-bottom:1px solid #E7E0D8;text-align:right;white-space:nowrap;
                   font:12px system-ui;color:${late ? '#A3322F' : '#8A6118'}">
          ${late ? 'overdue' : 'tonight'}
        </td>
      </tr>`
    }

    const followLine = (f: typeof followUps[number]) => `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #E7E0D8;font:14px system-ui">
        ${escapeHtml(f.title)}
      </td>
      <td style="padding:6px 0;border-bottom:1px solid #E7E0D8;text-align:right;white-space:nowrap;
                 font:12px system-ui;color:${f.overdue ? '#A3322F' : '#3F6386'}">
        ${f.overdue ? 'they are overdue' : 'due tomorrow'}
      </td>
    </tr>`

    const html = `<div style="max-width:520px;margin:0 auto">
      ${urgent.length > 0 ? `
      <h1 style="font:600 18px system-ui;color:#2A2320;margin:0 0 4px">Due tonight</h1>
      <p style="font:13px system-ui;color:#8B7C70;margin:0 0 12px">
        ${urgent.length} not marked done.
      </p>
      <table style="width:100%;border-collapse:collapse">${urgent.map(line).join('')}</table>` : ''}
      ${followUps.length > 0 ? `
      <h2 style="font:600 15px system-ui;color:#2A2320;margin:${urgent.length ? 20 : 0}px 0 4px">Follow up</h2>
      <p style="font:13px system-ui;color:#8B7C70;margin:0 0 8px">
        Exec team tasks due tomorrow or already late.
      </p>
      <table style="width:100%;border-collapse:collapse">${followUps.map(followLine).join('')}</table>` : ''}
      <p style="margin:16px 0 0">
        <a href="${APP_URL}" style="font:13px system-ui;color:#8A6118">Open the dashboard</a>
      </p>
    </div>`

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: FROM,
      to,
      subject: urgent.length > 0
        ? `${urgent.length} due tonight${followUps.length ? ` · ${followUps.length} to follow up` : ''}`
        : `${followUps.length} to follow up tomorrow`,
      html,
    })

    return NextResponse.json({ ok: true, sent: true, count: urgent.length, followUps: followUps.length, to })
  } catch (err) {
    return serverError('cron.urgent.GET', err)
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
