import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.EMAIL_FROM ?? 'tasks@yourdomain.com'

// ----------------------------------------------------------------
// Contributor digest
// ----------------------------------------------------------------

interface ContributorDigestArgs {
  contributor: {
    id:   string
    name: string
    email: string
  }
  assignments: {
    id:     string
    status: string
    tasks:  { title: string; due_date: string | null; projects: { name: string } | null } | null
  }[]
  portalUrl: string
}

export async function sendContributorDigest({
  contributor,
  assignments,
  portalUrl,
}: ContributorDigestArgs) {
  const taskRows = assignments
    .map(a => {
      const task = a.tasks
      const proj = task?.projects?.name ?? 'Unknown project'
      const due  = task?.due_date
        ? `Due ${new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : 'No due date'
      return `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0">
            <strong style="color:#111;font-size:14px">${task?.title ?? '—'}</strong>
            <br><span style="color:#888;font-size:12px">${proj} · ${due}</span>
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:right">
            <span style="background:${a.status === 'in_progress' ? '#eff6ff' : '#f9fafb'};
                         color:${a.status === 'in_progress' ? '#2563eb' : '#6b7280'};
                         font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500">
              ${a.status.replace('_', ' ')}
            </span>
          </td>
        </tr>`
    })
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;
                  border:1px solid #e5e7eb;overflow:hidden">
        <div style="background:#4f46e5;padding:28px 32px">
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Your pending tasks</h1>
          <p style="color:#a5b4fc;margin:4px 0 0;font-size:14px">Hi ${contributor.name} 👋</p>
        </div>
        <div style="padding:24px 32px">
          <p style="color:#374151;font-size:14px;margin:0 0 20px">
            You have <strong>${assignments.length} task${assignments.length > 1 ? 's' : ''}</strong> 
            that still need your attention:
          </p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
            ${taskRows}
          </table>
          <div style="text-align:center;margin-top:28px">
            <a href="${portalUrl}"
               style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;
                      padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
              View my tasks →
            </a>
          </div>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center">
          <p style="color:#9ca3af;font-size:12px;margin:0">
            You can update your notification frequency from the portal.
          </p>
        </div>
      </div>
    </body>
    </html>`

  return resend.emails.send({
    from:    FROM,
    to:      contributor.email,
    subject: `${assignments.length} pending task${assignments.length > 1 ? 's' : ''} waiting for you`,
    html,
  })
}

// ----------------------------------------------------------------
// Admin digest
// ----------------------------------------------------------------

interface AdminDigestArgs {
  adminEmail:    string
  notifications: {
    id:          string
    type:        string
    created_at:  string
    task_assignments: {
      status: string
      tasks:        { title: string } | null
      contributors: { name:  string } | null
    } | null
  }[]
  dashboardUrl: string
}

export async function sendAdminDigest({
  adminEmail,
  notifications,
  dashboardUrl,
}: AdminDigestArgs) {
  const rows = notifications
    .map(n => {
      const who  = n.task_assignments?.contributors?.name ?? '—'
      const what = n.task_assignments?.tasks?.title        ?? '—'
      const when = new Date(n.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
      const icon = n.type === 'task_completed' ? '✅' : '💬'
      const verb = n.type === 'task_completed' ? 'completed' : 'posted an update on'
      return `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:14px">
            ${icon} <strong>${who}</strong> ${verb} <em>${what}</em>
            <br><span style="color:#9ca3af;font-size:12px">${when}</span>
          </td>
        </tr>`
    })
    .join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;
                  border:1px solid #e5e7eb;overflow:hidden">
        <div style="background:#111827;padding:28px 32px">
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">
            ${notifications.length} new update${notifications.length > 1 ? 's' : ''}
          </h1>
          <p style="color:#9ca3af;margin:4px 0 0;font-size:14px">Project activity digest</p>
        </div>
        <div style="padding:24px 32px">
          <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;
                        border-radius:12px;overflow:hidden">
            ${rows}
          </table>
          <div style="text-align:center;margin-top:28px">
            <a href="${dashboardUrl}"
               style="display:inline-block;background:#111827;color:#fff;text-decoration:none;
                      padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
              View dashboard →
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>`

  return resend.emails.send({
    from:    FROM,
    to:      adminEmail,
    subject: `${notifications.length} project update${notifications.length > 1 ? 's' : ''} since your last check-in`,
    html,
  })
}
