'use client'

import AdminProjectLink from './AdminProjectLink'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NotifFrequency } from '@/lib/types/portal'

const FREQ_LABELS: Record<NotifFrequency, string> = {
  daily:           'Daily',
  every_other_day: 'Every other day',
  weekly:          'Weekly',
}

function fmt(d: string | null) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isOverdue(d: string | null, status: string) {
  if (!d || status === 'completed') return false
  return new Date(d + 'T00:00:00') < new Date()
}

function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' }
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center
                  font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: color ?? '#6366f1' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

// ── Update item (edit / delete) ──────────────────────────────────

function UpdateItem({ update, onDelete }: { update: any; onDelete: (id: string) => void }) {
  const [editing,  setEditing]  = useState(false)
  const [text,     setText]     = useState(update.content)
  const [content,  setContent]  = useState(update.content)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    const res = await fetch(`/api/portal/updates/${update.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text.trim() }),
    })
    if (res.ok) { setContent(text.trim()); setEditing(false) }
    setSaving(false)
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/portal/updates/${update.id}`, { method: 'DELETE' })
    if (res.ok) onDelete(update.id)
    setDeleting(false)
  }

  if (editing) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={2}
          className="w-full bg-transparent focus:outline-none resize-none text-sm
                     text-gray-700 leading-relaxed"
        />
        <div className="flex gap-3 mt-2">
          <button onClick={handleSave} disabled={saving}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg
                             font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => { setEditing(false); setText(content) }}
                  className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
      <p className="text-sm text-gray-700 leading-relaxed">{content}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">{fmt(update.created_at)}</span>
        <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-indigo-600 font-medium">
            Edit
          </button>
          <button onClick={handleDelete} disabled={deleting}
                  className="text-xs text-gray-400 hover:text-red-500 font-medium">
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Resource item ────────────────────────────────────────────────

function ResourceItem({ r }: { r: any }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-base mt-0.5">{r.type === 'link' ? '🔗' : '📝'}</span>
      <div className="min-w-0 flex-1">
        {r.type === 'link' ? (
          <a href={r.content} target="_blank" rel="noopener noreferrer"
             className="text-sm text-indigo-600 hover:underline truncate block font-medium">
            {r.label || r.content}
          </a>
        ) : (
          <p className="text-sm text-gray-700 leading-relaxed">{r.content}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{fmt(r.created_at)}</p>
      </div>
    </div>
  )
}

// ── Subtask row ──────────────────────────────────────────────────

function SubtaskRow({ subtask, projectColor }: { subtask: any; projectColor?: string }) {
  const router      = useRouter()
  const color       = projectColor ?? '#6366f1'
  const [status,      setStatus]      = useState(subtask.status)
  const [updates,     setUpdates]     = useState(subtask.updates)
  const [showUpdate,  setShowUpdate]  = useState(false)
  const [showRes,     setShowRes]     = useState(false)
  const [updateText,  setUpdateText]  = useState('')
  const [posting,     setPosting]     = useState(false)
  const [completing,  setCompleting]  = useState(false)
  const [showResource, setShowResource] = useState(false)
  const [resType,      setResType]      = useState<'link' | 'note'>('link')
  const [resLabel,     setResLabel]     = useState('')
  const [resContent,   setResContent]   = useState('')
  const [postingRes,   setPostingRes]   = useState(false)

  const overdue   = isOverdue(subtask.subtask_due, status)
  const teammates: any[] = subtask.teammates ?? []

  const accentColor =
    status === 'completed'   ? '#4ade80' :
    status === 'in_progress' ? '#60a5fa' :
    '#e5e7eb'

  async function handleStatusChange(newStatus: string) {
    setCompleting(true)
    const res = await fetch(`/api/portal/subtasks/${subtask.assignment_id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) setStatus(newStatus)
    setCompleting(false)
  }

  async function handlePostUpdate() {
    if (!updateText.trim()) return
    setPosting(true)
    const res = await fetch(`/api/portal/subtasks/${subtask.assignment_id}/updates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: updateText.trim() }),
    })
    if (res.ok) {
      const { update } = await res.json()
      setUpdates((prev: any[]) => [...prev, update])
      setUpdateText('')
      setShowUpdate(false)
    }
    setPosting(false)
  }

  async function handleAddResource() {
    if (!resContent.trim()) return
    setPostingRes(true)
    const res = await fetch(`/api/portal/subtasks/${subtask.assignment_id}/resources`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: resType, label: resLabel.trim() || null, content: resContent.trim() }),
    })
    if (res.ok) {
      setResContent(''); setResLabel(''); setShowResource(false); router.refresh()
    }
    setPostingRes(false)
  }

  return (
    <div className={`rounded-2xl overflow-hidden border shadow-sm transition-all
                     ${status === 'completed' ? 'border-green-100' : 'border-gray-200 bg-white'}`}>

      {/* Status bar */}
      <div className="h-1" style={{ backgroundColor: accentColor }} />

      <div className={`p-5 ${status === 'completed' ? 'bg-green-50/40' : 'bg-white'}`}>

        {/* Header row */}
        <div className="flex items-start gap-3.5">
          <button
            onClick={() => handleStatusChange(status === 'completed' ? 'pending' : 'completed')}
            disabled={completing}
            className={`w-6 h-6 rounded-full border-2 flex-shrink-0 mt-0.5
                        flex items-center justify-center transition-all
                        ${status === 'completed'
                          ? 'bg-green-500 border-green-500 shadow-sm'
                          : 'border-gray-300 hover:border-green-400 hover:scale-110'}`}
          >
            {status === 'completed' && (
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`font-semibold leading-snug
                           ${status === 'completed'
                             ? 'line-through text-gray-400 text-sm'
                             : 'text-gray-900 text-base'}`}>
              {subtask.subtask_title}
            </p>

            {subtask.subtask_desc && (
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">{subtask.subtask_desc}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {status === 'completed' && subtask.completed_at && (
                <span className="inline-flex items-center gap-1 text-xs bg-green-100
                                  text-green-700 px-2.5 py-1 rounded-full font-medium">
                  ✓ Done {fmt(subtask.completed_at)}
                </span>
              )}
              {status === 'in_progress' && (
                <span className="inline-flex items-center gap-1 text-xs bg-blue-50
                                  text-blue-600 px-2.5 py-1 rounded-full font-medium">
                  ● In progress
                </span>
              )}
              {subtask.subtask_due && (
                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium
                                  ${overdue
                                    ? 'bg-red-50 text-red-600 border border-red-200'
                                    : 'bg-gray-100 text-gray-500'}`}>
                  {overdue ? '⚠ Overdue · ' : ''}Due {fmt(subtask.subtask_due)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action row */}
        {status !== 'completed' && (
          <div className="flex flex-wrap gap-2 mt-4 ml-9">
            {status === 'pending' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100
                           px-3.5 py-1.5 rounded-full font-medium transition-colors"
              >
                Mark in progress
              </button>
            )}
            <button
              onClick={() => setShowUpdate(v => !v)}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-colors
                         ${showUpdate
                           ? 'bg-gray-200 text-gray-700'
                           : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {showUpdate ? '✕ Cancel' : '+ Leave update'}
            </button>
            {subtask.resources?.length > 0 && (
              <button
                onClick={() => setShowRes(v => !v)}
                className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200
                           px-3.5 py-1.5 rounded-full font-medium transition-colors"
              >
                📎 {subtask.resources.length} resource{subtask.resources.length > 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => setShowResource(v => !v)}
              className="text-xs border border-dashed border-gray-300 text-gray-400
                         hover:border-indigo-300 hover:text-indigo-600
                         px-3.5 py-1.5 rounded-full font-medium transition-colors"
            >
              {showResource ? '✕ Cancel' : '+ Share resource'}
            </button>
          </div>
        )}

        {/* Update input */}
        {showUpdate && (
          <div className="mt-4 ml-9 space-y-2.5">
            <textarea
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              placeholder="What's your update?"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3
                         focus:outline-none focus:border-indigo-400 focus:ring-2
                         focus:ring-indigo-50 resize-none transition-all"
            />
            <button
              onClick={handlePostUpdate}
              disabled={posting || !updateText.trim()}
              className="text-sm bg-indigo-600 text-white px-5 py-2 rounded-xl
                         hover:bg-indigo-700 disabled:opacity-40 font-medium transition-colors"
            >
              {posting ? 'Posting…' : 'Post update'}
            </button>
          </div>
        )}

        {/* Resources list */}
        {showRes && subtask.resources?.length > 0 && (
          <div className="mt-4 ml-9 bg-gray-50 rounded-xl p-4 border border-gray-100 divide-y divide-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Shared resources
            </p>
            {subtask.resources.map((r: any) => <ResourceItem key={r.id} r={r} />)}
          </div>
        )}

        {/* Share resource form */}
        {showResource && (
          <div className="mt-4 ml-9 bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex gap-2">
              {(['link', 'note'] as const).map(t => (
                <button key={t} type="button" onClick={() => setResType(t)}
                        className={`text-xs px-4 py-1.5 rounded-full font-medium border transition-colors
                                   ${resType === t
                                     ? 'bg-indigo-600 text-white border-indigo-600'
                                     : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {t === 'link' ? '🔗 Link' : '📝 Note'}
                </button>
              ))}
            </div>
            <input
              value={resLabel}
              onChange={e => setResLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                         focus:outline-none focus:border-indigo-400 bg-white"
            />
            {resType === 'link' ? (
              <input value={resContent} onChange={e => setResContent(e.target.value)}
                     placeholder="https://…"
                     className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                                focus:outline-none focus:border-indigo-400 bg-white" />
            ) : (
              <textarea value={resContent} onChange={e => setResContent(e.target.value)}
                        placeholder="Note content…" rows={2}
                        className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                                   focus:outline-none focus:border-indigo-400 bg-white resize-none" />
            )}
            <button onClick={handleAddResource} disabled={postingRes || !resContent.trim()}
                    className="text-sm bg-indigo-600 text-white px-5 py-2 rounded-xl
                               hover:bg-indigo-700 disabled:opacity-40 font-medium transition-colors">
              {postingRes ? 'Sharing…' : 'Share'}
            </button>
          </div>
        )}

        {/* Team on this task */}
        {teammates.length > 0 && (
          <div className="mt-5 ml-9">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Team on this task
            </p>
            <div className="space-y-2.5">
              {teammates.map((t: any, i: number) => (
                <div key={i}
                     className="flex items-start gap-3 bg-gray-50 border border-gray-100
                                rounded-xl p-3.5">
                  <Avatar name={t.name} color={color} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                    {t.role_name && (
                      <p className="text-xs font-medium text-indigo-500 mt-0.5">{t.role_name}</p>
                    )}
                    {t.assignedSections?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {t.assignedSections.map((s: string, j: number) => (
                          <span key={j}
                                className="text-xs bg-white border border-gray-200 text-gray-600
                                           px-2.5 py-1 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4 mt-2.5">
                      {t.email && (
                        <a href={`mailto:${t.email}`}
                           className="text-xs text-gray-500 hover:text-indigo-600 transition-colors
                                      flex items-center gap-1">
                          <span>✉</span> {t.email}
                        </a>
                      )}
                      {t.phone && (
                        <a href={`tel:${t.phone}`}
                           className="text-xs text-gray-500 hover:text-indigo-600 transition-colors
                                      flex items-center gap-1">
                          <span>📱</span> {t.phone}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous updates */}
        {updates.length > 0 && (
          <div className="mt-5 ml-9 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Your updates
            </p>
            {updates.map((u: any) => (
              <UpdateItem
                key={u.id}
                update={u}
                onDelete={id => setUpdates((prev: any[]) => prev.filter(x => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Project admin view ───────────────────────────────────────────

function ProjectAdminView({ project, tasks }: { project: any; tasks: any[] }) {
  const [open, setOpen] = useState(true)
  const projectTasks = tasks.filter(t => t.project_id === project.project_id)
  if (projectTasks.length === 0) return null

  return (
    <section>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 mb-4 group w-full text-left"
      >
        <span className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: project.project_color }} />
        <span className="text-base font-bold text-gray-800 group-hover:text-indigo-700 flex-1">
          {project.project_name}
        </span>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">
          Admin
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3">
          {projectTasks.map((task: any) => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-4">{task.title}</p>
              {task.subtasks?.length > 0 ? (
                <div className="space-y-2.5">
                  {task.subtasks.map((s: any) => (
                    <div key={s.id} className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                      <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                      {s.subtask_assignments?.length > 0 ? (
                        <div className="mt-2.5 space-y-2">
                          {s.subtask_assignments.map((sa: any) => (
                            <div key={sa.id} className="flex items-center gap-2.5">
                              <Avatar name={sa.contributors?.name ?? '?'}
                                      color={project.project_color} size="sm" />
                              <span className="text-sm font-medium text-gray-700 flex-1">
                                {sa.contributors?.name}
                              </span>
                              <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                                               ${sa.status === 'completed'
                                                 ? 'bg-green-100 text-green-700'
                                                 : sa.status === 'in_progress'
                                                 ? 'bg-blue-100 text-blue-700'
                                                 : 'bg-gray-100 text-gray-500'}`}>
                                {sa.status.replace('_', ' ')}
                              </span>
                              {sa.subtask_updates?.length > 0 && (
                                <span className="text-xs text-gray-400 italic line-clamp-1 flex-1 max-w-[160px]">
                                  "{sa.subtask_updates[sa.subtask_updates.length - 1].content}"
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-2">No one assigned yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No sections yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Contributor project group ────────────────────────────────────

function ContributorProjectGroup({ group }: { group: any }) {
  const totalSubtasks = group.tasks.reduce((n: number, t: any) => n + t.subtasks.length, 0)
  const doneSubtasks  = group.tasks.reduce((n: number, t: any) =>
    n + t.subtasks.filter((s: any) => s.status === 'completed').length, 0)
  const pct = totalSubtasks > 0 ? Math.round(doneSubtasks / totalSubtasks * 100) : 0

  return (
    <section>
      {/* Project header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1.5 h-10 rounded-full flex-shrink-0"
             style={{ backgroundColor: group.project_color }} />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-900 truncate">{group.project_name}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{doneSubtasks} of {totalSubtasks} sections done</p>
        </div>
        <span className="text-sm font-bold flex-shrink-0"
              style={{ color: group.project_color }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-6 overflow-hidden ml-5">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${pct}%`, backgroundColor: group.project_color }} />
      </div>

      <div className="space-y-8 ml-5">
        {group.tasks.map((task: any) => (
          <div key={task.task_id}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              {task.task_title}
            </p>
            <div className="space-y-3">
              {task.subtasks.map((s: any) => (
                <SubtaskRow
                  key={s.assignment_id}
                  subtask={s}
                  projectColor={group.project_color}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main dashboard ───────────────────────────────────────────────

export default function ContributorDashboard({
  contributor,
  projectGroups,
  adminProjectData,
  pendingCount,
}: {
  contributor:      any
  projectGroups:    any[]
  adminProjectData: any[]
  pendingCount:     number
}) {
  const [email,       setEmail]       = useState(contributor.email ?? '')
  const [freq,        setFreq]        = useState<NotifFrequency>(contributor.notif_frequency)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved,  setPrefsSaved]  = useState(false)
  const [showPrefs,   setShowPrefs]   = useState(false)

  const adminProjects = projectGroups.filter(g => g.role === 'admin')
  const myProjects    = projectGroups.filter(g => g.role === 'contributor')

  async function savePrefs() {
    setSavingPrefs(true)
    await fetch('/api/portal/prefs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, notif_frequency: freq }),
    })
    setSavingPrefs(false)
    setPrefsSaved(true)
    setTimeout(() => setPrefsSaved(false), 2500)
  }

  async function handleLogout() {
    await fetch('/api/portal/auth', { method: 'DELETE' })
    window.location.href = '/portal'
  }

  return (
    <main className="min-h-screen bg-slate-50">

      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={contributor.name} color="#6366f1" size="md" />
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">{contributor.name}</p>
              <p className="text-xs text-gray-400">
                {pendingCount > 0 ? `${pendingCount} pending` : 'All caught up'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPrefs(v => !v)}
              className={`text-xs px-3.5 py-2 rounded-xl font-medium transition-colors
                         ${showPrefs
                           ? 'bg-indigo-100 text-indigo-700'
                           : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              ⚙ Prefs
            </button>
            <button
              onClick={handleLogout}
              className="text-xs border border-gray-200 text-gray-500 px-3.5 py-2 rounded-xl
                         hover:bg-gray-50 transition-colors font-medium"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-5 py-8">

        {/* Pending banner */}
        {pendingCount > 0 ? (
          <div className="bg-indigo-600 rounded-2xl px-6 py-5 mb-8 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center
                            text-white font-bold text-xl flex-shrink-0">
              {pendingCount}
            </div>
            <div>
              <p className="text-white font-bold text-base">
                {pendingCount} pending section{pendingCount > 1 ? 's' : ''}
              </p>
              <p className="text-indigo-200 text-sm mt-0.5">Review and update your progress below</p>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-100 rounded-2xl px-6 py-5 mb-8 flex items-center gap-4">
            <span className="text-3xl">🎉</span>
            <div>
              <p className="text-green-800 font-bold text-base">All caught up!</p>
              <p className="text-green-600 text-sm mt-0.5">Nothing pending right now. Great work.</p>
            </div>
          </div>
        )}

        {/* Prefs panel */}
        {showPrefs && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-8 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-5">Email notifications</h3>
            <div className="space-y-4">
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setPrefsSaved(false) }}
                placeholder="your@email.com"
                className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3
                           focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
              />
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(FREQ_LABELS) as NotifFrequency[]).map(f => (
                  <button key={f} onClick={() => { setFreq(f); setPrefsSaved(false) }}
                          className={`text-sm px-4 py-2 rounded-xl font-medium border transition-colors
                                     ${freq === f
                                       ? 'bg-indigo-600 text-white border-indigo-600'
                                       : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {FREQ_LABELS[f]}
                  </button>
                ))}
              </div>
              <button onClick={savePrefs} disabled={savingPrefs}
                      className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm
                                 font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {prefsSaved ? '✓ Saved' : savingPrefs ? 'Saving…' : 'Save preferences'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-12">

          {/* My assigned work */}
          {myProjects.map(g => (
            <ContributorProjectGroup key={g.project_id} group={g} />
          ))}

          {/* Projects I manage */}
          {adminProjects.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Projects you manage
                </span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
              {adminProjects.map(g => (
                <AdminProjectLink
                  key={g.project_id}
                  projectId={g.project_id}
                  projectName={g.project_name}
                  projectColor={g.project_color}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {projectGroups.length === 0 && (
            <div className="text-center py-24">
              <p className="text-5xl mb-4">📋</p>
              <p className="text-lg font-bold text-gray-500">No projects assigned yet</p>
              <p className="text-sm text-gray-400 mt-1">Check back soon.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
