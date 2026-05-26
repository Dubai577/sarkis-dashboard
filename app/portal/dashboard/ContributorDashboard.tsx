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

// ── Resource item ────────────────────────────────────────────────

function ResourceItem({ r }: { r: any }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className="text-xs mt-0.5">{r.type === 'link' ? '🔗' : '📝'}</span>
      <div className="min-w-0 flex-1">
        {r.type === 'link' ? (
          <a href={r.content} target="_blank" rel="noopener noreferrer"
             className="text-xs text-indigo-600 hover:underline truncate block">
            {r.label || r.content}
          </a>
        ) : (
          <p className="text-xs text-gray-600 leading-relaxed">{r.content}</p>
        )}
        <p className="text-xs text-gray-400">{fmt(r.created_at)}</p>
      </div>
    </div>
  )
}

// ── Subtask row ──────────────────────────────────────────────────

function SubtaskRow({ subtask }: { subtask: any }) {
  const router = useRouter()
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

  const overdue = isOverdue(subtask.subtask_due, status)
  const teammates: any[] = subtask.teammates ?? []

  async function handleStatusChange(newStatus: string) {
    setCompleting(true)
    const res = await fetch(`/api/portal/subtasks/${subtask.assignment_id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    })
    if (res.ok) setStatus(newStatus)
    setCompleting(false)
  }

  async function handlePostUpdate() {
    if (!updateText.trim()) return
    setPosting(true)
    const res = await fetch(`/api/portal/subtasks/${subtask.assignment_id}/updates`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content: updateText.trim() }),
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
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        type:    resType,
        label:   resLabel.trim() || null,
        content: resContent.trim(),
      }),
    })
    if (res.ok) {
      setResContent('')
      setResLabel('')
      setShowResource(false)
      router.refresh()
    }
    setPostingRes(false)
  }

  return (
    <div className={`bg-white rounded-xl border transition-all
                     ${status === 'completed'
                       ? 'border-green-100 opacity-60'
                       : 'border-gray-200'}`}>
      <div className="p-5">
        <div className="flex items-start gap-3">
          {/* Complete button */}
          <button
            onClick={() => handleStatusChange(status === 'completed' ? 'pending' : 'completed')}
            disabled={completing}
            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5
                        flex items-center justify-center transition-colors
                        ${status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'border-gray-300 hover:border-green-400'}`}
          >
            {status === 'completed' && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium leading-snug
                           ${status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
              {subtask.subtask_title}
            </p>
            {subtask.subtask_desc && (
              <p className="text-xs text-gray-500 mt-0.5">{subtask.subtask_desc}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {subtask.subtask_due && (
                <span className={`text-xs font-medium ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                  {overdue ? '⚠ ' : ''}Due {fmt(subtask.subtask_due)}
                </span>
              )}
              {status === 'in_progress' && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                  In progress
                </span>
              )}
              {status === 'completed' && subtask.completed_at && (
                <span className="text-xs text-gray-400">Done {fmt(subtask.completed_at)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {status !== 'completed' && (
          <div className="flex flex-wrap gap-3 mt-3 pl-8">
            {status === 'pending' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark in progress
              </button>
            )}
            <button
              onClick={() => setShowUpdate(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              {showUpdate ? 'Cancel' : '+ Leave update'}
            </button>
            {subtask.resources?.length > 0 && (
              <button
                onClick={() => setShowRes(v => !v)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showRes ? 'Hide' : `📎 ${subtask.resources.length} resource${subtask.resources.length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}

        {/* Update input */}
        {showUpdate && (
          <div className="mt-3 pl-8 space-y-2">
            <textarea
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              placeholder="What's your update?"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                         focus:outline-none focus:border-indigo-400 resize-none"
            />
            <button
              onClick={handlePostUpdate}
              disabled={posting || !updateText.trim()}
              className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg
                         hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {posting ? 'Posting…' : 'Post update'}
            </button>
          </div>
        )}

        {/* Resources */}
        {showRes && subtask.resources?.length > 0 && (
          <div className="mt-3 pl-8 bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-medium text-gray-500 mb-2">Shared resources</p>
            {subtask.resources.map((r: any) => <ResourceItem key={r.id} r={r} />)}
          </div>
        )}

        {/* Share resource */}
        <div className="mt-3 pl-8">
          {showResource ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                {(['link', 'note'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setResType(t)}
                    className={`text-xs px-3 py-1 rounded-lg font-medium border transition-colors
                               ${resType === t
                                 ? 'bg-indigo-600 text-white border-indigo-600'
                                 : 'bg-white text-gray-600 border-gray-200'}`}
                  >
                    {t === 'link' ? '🔗 Link' : '📝 Note'}
                  </button>
                ))}
              </div>
              <input
                value={resLabel}
                onChange={e => setResLabel(e.target.value)}
                placeholder="Label (optional)"
                className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2
                           focus:outline-none focus:border-indigo-400"
              />
              {resType === 'link' ? (
                <input
                  value={resContent}
                  onChange={e => setResContent(e.target.value)}
                  placeholder="https://…"
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2
                             focus:outline-none focus:border-indigo-400"
                />
              ) : (
                <textarea
                  value={resContent}
                  onChange={e => setResContent(e.target.value)}
                  placeholder="Note content…"
                  rows={2}
                  className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2
                             focus:outline-none focus:border-indigo-400 resize-none"
                />
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddResource}
                  disabled={postingRes || !resContent.trim()}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg
                             hover:bg-indigo-700 disabled:opacity-50 font-medium"
                >
                  {postingRes ? 'Sharing…' : 'Share'}
                </button>
                <button
                  onClick={() => setShowResource(false)}
                  className="text-xs text-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResource(true)}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium"
            >
              + Share resource
            </button>
          )}
        </div>

        {/* Team on this task */}
        {teammates.length > 0 && (
          <div className="mt-3 pl-8">
            <p className="text-xs font-medium text-gray-500 mb-2">
              👥 Team on this task
            </p>
            <div className="space-y-2">
              {teammates.map((t: any, i: number) => (
                <div key={i} className="text-xs bg-gray-50 rounded-lg px-3 py-2">
                  <p className="font-medium text-gray-700">{t.name}</p>
                  {t.role_name && (
                    <p className="text-indigo-500 mt-0.5">{t.role_name}</p>
                  )}
                  {t.email && (
                    <a href={`mailto:${t.email}`}
                       className="text-gray-400 hover:text-indigo-600 mt-0.5 block">
                      {t.email}
                    </a>
                  )}
                  {t.phone && (
                    <a href={`tel:${t.phone}`}
                       className="text-gray-400 hover:text-indigo-600 block">
                      {t.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Previous updates */}
        {updates.length > 0 && (
          <div className="mt-3 pl-8 space-y-1.5">
            {updates.map((u: any) => (
              <div key={u.id}
                   className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2
                              border-l-2 border-gray-200 leading-relaxed">
                {u.content}
                <span className="block text-gray-400 mt-2">{fmt(u.created_at)}</span>
              </div>
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
        className="flex items-center gap-2 mb-3 group"
      >
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: project.project_color }} />
        <span className="text-sm font-semibold text-gray-700 group-hover:text-indigo-700">
          {project.project_name}
        </span>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
          Project admin
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3">
          {projectTasks.map((task: any) => (
            <div key={task.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">{task.title}</p>
              {task.subtasks?.length > 0 ? (
                <div className="space-y-2">
                  {task.subtasks.map((s: any) => (
                    <div key={s.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                      <p className="text-xs font-medium text-gray-800">{s.title}</p>
                      {s.subtask_assignments?.length > 0 ? (
                        <div className="mt-2 space-y-1.5">
                          {s.subtask_assignments.map((sa: any) => (
                            <div key={sa.id} className="flex items-start gap-2">
                              <span className="text-xs font-medium text-gray-600 min-w-[80px]">
                                {sa.contributors?.name}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full
                                               ${sa.status === 'completed'
                                                 ? 'bg-green-100 text-green-700'
                                                 : sa.status === 'in_progress'
                                                 ? 'bg-blue-100 text-blue-700'
                                                 : 'bg-gray-100 text-gray-500'}`}>
                                {sa.status.replace('_', ' ')}
                              </span>
                              {sa.subtask_updates?.length > 0 && (
                                <span className="text-xs text-gray-400 italic line-clamp-1 flex-1">
                                  "{sa.subtask_updates[sa.subtask_updates.length - 1].content}"
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">No one assigned yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No sections yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Contributor task view ────────────────────────────────────────

function ContributorProjectGroup({ group }: { group: any }) {
  const totalSubtasks = group.tasks.reduce((n: number, t: any) => n + t.subtasks.length, 0)
  const doneSubtasks  = group.tasks.reduce((n: number, t: any) =>
    n + t.subtasks.filter((s: any) => s.status === 'completed').length, 0)

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: group.project_color }} />
        <h2 className="text-sm font-semibold text-gray-700">{group.project_name}</h2>
        <span className="text-xs text-gray-400">{doneSubtasks}/{totalSubtasks} done</span>
      </div>

      <div className="space-y-6">
        {group.tasks.map((task: any) => (
          <div key={task.task_id}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 ml-1">
              {task.task_title}
            </p>
            <div className="space-y-3">
              {task.subtasks.map((s: any) => (
                <SubtaskRow key={s.assignment_id} subtask={s} />
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
  const [email,      setEmail]      = useState(contributor.email ?? '')
  const [freq,       setFreq]       = useState<NotifFrequency>(contributor.notif_frequency)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved,  setPrefsSaved]  = useState(false)
  const [showPrefs,   setShowPrefs]   = useState(false)

  const adminProjects = projectGroups.filter(g => g.role === 'admin')
  const myProjects    = projectGroups.filter(g => g.role === 'contributor')

  async function savePrefs() {
    setSavingPrefs(true)
    await fetch('/api/portal/prefs', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, notif_frequency: freq }),
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
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Hi, {contributor.name} 👋
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {pendingCount > 0
                ? `${pendingCount} pending task${pendingCount > 1 ? 's' : ''} waiting for you.`
                : 'All caught up! Nothing pending right now.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPrefs(v => !v)}
              className="text-xs border border-gray-200 px-3 py-2 rounded-xl
                         text-gray-500 hover:bg-white transition-colors"
            >
              ⚙ Prefs
            </button>
            <button
              onClick={handleLogout}
              className="text-xs border border-gray-200 px-3 py-2 rounded-xl
                         text-gray-500 hover:bg-white transition-colors"
            >
              Log out
            </button>
          </div>
        </div>

        {/* Notification prefs (collapsible) */}
        {showPrefs && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Email notifications</h3>
            <div className="space-y-3">
              <input
                type="email" value={email}
                onChange={e => { setEmail(e.target.value); setPrefsSaved(false) }}
                placeholder="your@email.com"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                           focus:outline-none focus:border-indigo-400"
              />
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(FREQ_LABELS) as NotifFrequency[]).map(f => (
                  <button key={f} onClick={() => { setFreq(f); setPrefsSaved(false) }}
                          className={`text-xs px-4 py-2 rounded-xl font-medium border transition-colors
                                     ${freq === f
                                       ? 'bg-indigo-600 text-white border-indigo-600'
                                       : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {FREQ_LABELS[f]}
                  </button>
                ))}
              </div>
              <button onClick={savePrefs} disabled={savingPrefs}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm
                                 font-medium hover:bg-indigo-700 disabled:opacity-50">
                {prefsSaved ? '✓ Saved' : savingPrefs ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-10">

          {/* My assigned work */}
          {myProjects.length > 0 && myProjects.map(g => (
            <ContributorProjectGroup key={g.project_id} group={g} />
          ))}

          {/* Project admin overviews */}
          {adminProjects.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Projects you manage</h2>
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
            <div className="text-center py-20 text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p className="font-medium text-gray-500">No projects assigned yet.</p>
              <p className="text-sm mt-1">Check back soon.</p>
            </div>
          )}

        </div>
      </div>
    </main>
  )
}
