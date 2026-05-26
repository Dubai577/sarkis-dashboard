'use client'

import { useState } from 'react'
import { TaskStatus, NotifFrequency } from '@/lib/types/portal'

interface TaskGroup {
  project_id:    string
  project_name:  string
  project_color: string
  tasks: {
    assignment_id:    string
    status:           TaskStatus
    completed_at:     string | null
    task_id:          string
    task_title:       string
    task_description: string | null
    task_due_date:    string | null
    updates:          { id: string; content: string; created_at: string }[]
  }[]
}

interface ContributorInfo {
  id:              string
  email:           string | null
  notif_frequency: NotifFrequency
}

const FREQ_LABELS: Record<NotifFrequency, string> = {
  daily:          'Daily',
  every_other_day:'Every other day',
  weekly:         'Weekly',
}

function fmt(date: string | null) {
  if (!date) return null
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

function isOverdue(date: string | null, status: TaskStatus) {
  if (!date || status === 'completed') return false
  return new Date(date + 'T00:00:00') < new Date()
}

// ----------------------------------------------------------------
// Individual task row
// ----------------------------------------------------------------

function TaskRow({ task, onStatusChange, onPostUpdate }: {
  task: TaskGroup['tasks'][number]
  onStatusChange: (assignmentId: string, status: TaskStatus) => Promise<void>
  onPostUpdate:   (assignmentId: string, content: string) => Promise<void>
}) {
  const [showUpdate, setShowUpdate]   = useState(false)
  const [updateText, setUpdateText]   = useState('')
  const [posting, setPosting]         = useState(false)
  const [completing, setCompleting]   = useState(false)
  const overdue = isOverdue(task.task_due_date, task.status)

  async function handleComplete() {
    if (task.status === 'completed') return
    setCompleting(true)
    await onStatusChange(task.assignment_id, 'completed')
    setCompleting(false)
  }

  async function handleInProgress() {
    if (task.status !== 'pending') return
    await onStatusChange(task.assignment_id, 'in_progress')
  }

  async function handlePostUpdate() {
    if (!updateText.trim()) return
    setPosting(true)
    await onPostUpdate(task.assignment_id, updateText.trim())
    setUpdateText('')
    setShowUpdate(false)
    setPosting(false)
  }

  return (
    <div className={`bg-white rounded-xl border transition-all
                     ${task.status === 'completed'
                       ? 'border-green-100 opacity-70'
                       : 'border-gray-200 hover:border-gray-300'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">

          {/* Checkbox */}
          <button
            onClick={handleComplete}
            disabled={task.status === 'completed' || completing}
            aria-label="Mark complete"
            className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5
                        flex items-center justify-center transition-colors
                        ${task.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'border-gray-300 hover:border-green-400'}`}
          >
            {task.status === 'completed' && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24"
                   stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium leading-snug
                           ${task.status === 'completed'
                             ? 'line-through text-gray-400'
                             : 'text-gray-900'}`}>
              {task.task_title}
            </p>
            {task.task_description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {task.task_description}
              </p>
            )}

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {task.task_due_date && (
                <span className={`text-xs font-medium
                                  ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
                  {overdue ? '⚠ ' : ''}Due {fmt(task.task_due_date)}
                </span>
              )}
              {task.status === 'in_progress' && (
                <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                  In progress
                </span>
              )}
              {task.status === 'completed' && task.completed_at && (
                <span className="text-xs text-gray-400">
                  Completed {fmt(task.completed_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {task.status !== 'completed' && (
          <div className="flex items-center gap-3 mt-3 pl-8">
            {task.status === 'pending' && (
              <button
                onClick={handleInProgress}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Mark in progress
              </button>
            )}
            <button
              onClick={() => setShowUpdate(v => !v)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              {showUpdate ? 'Cancel' : '+ Leave update'}
            </button>
          </div>
        )}

        {/* Update input */}
        {showUpdate && (
          <div className="mt-3 pl-8 space-y-2">
            <textarea
              value={updateText}
              onChange={e => setUpdateText(e.target.value)}
              placeholder="What's your update? e.g. Finished section 1, here are my notes…"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                         focus:outline-none focus:border-indigo-400 resize-none
                         placeholder:text-gray-400"
            />
            <button
              onClick={handlePostUpdate}
              disabled={posting || !updateText.trim()}
              className="text-xs bg-indigo-600 text-white px-4 py-2 rounded-lg
                         hover:bg-indigo-700 disabled:opacity-50 font-medium
                         transition-colors"
            >
              {posting ? 'Posting…' : 'Post update'}
            </button>
          </div>
        )}

        {/* Previous updates */}
        {task.updates.length > 0 && (
          <div className="mt-3 pl-8 space-y-2">
            {task.updates.map(u => (
              <div key={u.id}
                   className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2
                              border-l-2 border-gray-200 leading-relaxed">
                {u.content}
                <span className="block text-gray-400 mt-0.5">{fmt(u.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------
// Main list
// ----------------------------------------------------------------

export default function ContributorTaskList({
  groups: initialGroups,
  contributor,
}: {
  groups:      TaskGroup[]
  contributor: ContributorInfo
}) {
  const [groups, setGroups]       = useState(initialGroups)
  const [email, setEmail]         = useState(contributor.email ?? '')
  const [freq, setFreq]           = useState<NotifFrequency>(contributor.notif_frequency)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefsSaved, setPrefsSaved]  = useState(false)

  async function handleStatusChange(assignmentId: string, status: TaskStatus) {
    const res = await fetch(`/api/portal/tasks/${assignmentId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
    })
    if (!res.ok) return

    setGroups(prev => prev.map(g => ({
      ...g,
      tasks: g.tasks.map(t =>
        t.assignment_id === assignmentId
          ? { ...t, status, completed_at: status === 'completed' ? new Date().toISOString() : t.completed_at }
          : t
      ),
    })))
  }

  async function handlePostUpdate(assignmentId: string, content: string) {
    const res = await fetch(`/api/portal/tasks/${assignmentId}/updates`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    })
    if (!res.ok) return

    const { update } = await res.json()
    setGroups(prev => prev.map(g => ({
      ...g,
      tasks: g.tasks.map(t =>
        t.assignment_id === assignmentId
          ? { ...t, updates: [...t.updates, update] }
          : t
      ),
    })))
  }

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

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🎉</p>
        <p className="font-medium text-gray-500">No tasks assigned yet.</p>
        <p className="text-sm mt-1">Check back soon.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Projects + tasks */}
      {groups.map(g => (
        <section key={g.project_id}>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: g.project_color }} />
            <h2 className="text-sm font-semibold text-gray-700">{g.project_name}</h2>
            <span className="text-xs text-gray-400">
              {g.tasks.filter(t => t.status === 'completed').length}/{g.tasks.length} done
            </span>
          </div>
          <div className="space-y-2.5">
            {g.tasks.map(task => (
              <TaskRow
                key={task.assignment_id}
                task={task}
                onStatusChange={handleStatusChange}
                onPostUpdate={handlePostUpdate}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Notification preferences */}
      <section className="bg-white rounded-2xl border border-gray-200 p-5 mt-10">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Email notifications</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5" htmlFor="email">
              Your email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setPrefsSaved(false) }}
              placeholder="you@example.com"
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5
                         focus:outline-none focus:border-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">
              Reminder frequency
            </label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(FREQ_LABELS) as NotifFrequency[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setFreq(f); setPrefsSaved(false) }}
                  className={`text-xs px-4 py-2 rounded-xl font-medium transition-colors border
                               ${freq === f
                                 ? 'bg-indigo-600 text-white border-indigo-600'
                                 : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  {FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={savePrefs}
            disabled={savingPrefs}
            className="text-sm bg-indigo-600 text-white px-5 py-2.5 rounded-xl
                       hover:bg-indigo-700 disabled:opacity-50 font-medium
                       transition-colors"
          >
            {prefsSaved ? '✓ Saved' : savingPrefs ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </section>
    </div>
  )
}
