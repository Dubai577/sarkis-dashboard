'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTask } from '@/app/actions/tasks'
import { addProjectNote } from '@/app/actions/portalNotes'
import { assignContributorToSubtask, createSubtask } from '@/app/actions/tasks'

const TASK_STATUS_COLOR: Record<string, string> = {
  pending:     'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
}

function fmt(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

// ── Task card ────────────────────────────────────────────────────

function TaskCard({
  task, allContributors, projectId,
}: {
  task: any; allContributors: any[]; projectId: string
}) {
  const router = useRouter()
  const [expanded,     setExpanded]     = useState(false)
  const [addingSub,    setAddingSub]    = useState(false)
  const [assigningId,  setAssigningId]  = useState<string | null>(null)
  const [selectedCont, setSelectedCont] = useState('')

  const totalSubs = task.subtasks?.length ?? 0
  const doneSubs  = task.subtasks?.filter((s: any) =>
    s.subtask_assignments?.every((a: any) => a.status === 'completed')
  ).length ?? 0

  async function handleAssign(subtaskId: string) {
    if (!selectedCont) return
    await assignContributorToSubtask(subtaskId, selectedCont, task.id, projectId)
    setAssigningId(null)
    setSelectedCont('')
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Task header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform
                           ${expanded ? 'rotate-90' : ''}`}
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-gray-900 text-left">{task.title}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          {task.due_date && (
            <span className="text-xs text-gray-400">{fmt(task.due_date)}</span>
          )}
          {totalSubs > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {doneSubs}/{totalSubs}
            </span>
          )}
        </div>
      </button>

      {/* Subtasks */}
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {task.subtasks?.length > 0 ? task.subtasks.map((s: any) => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800">{s.title}</p>
                  {s.due_date && (
                    <p className="text-xs text-gray-400 mt-0.5">Due {fmt(s.due_date)}</p>
                  )}
                </div>
              </div>

              {/* Assignments */}
              <div className="mt-2 space-y-1.5">
                {s.subtask_assignments?.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center
                                    justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                      {a.contributors?.name?.[0]}
                    </div>
                    <span className="text-xs text-gray-700">{a.contributors?.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TASK_STATUS_COLOR[a.status]}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                    {a.subtask_updates?.length > 0 && (
                      <span className="text-xs text-gray-400 italic line-clamp-1 flex-1">
                        "{a.subtask_updates[a.subtask_updates.length - 1].content}"
                      </span>
                    )}
                  </div>
                ))}

                {/* Assign button */}
                {assigningId === s.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      value={selectedCont}
                      onChange={e => setSelectedCont(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white flex-1"
                    >
                      <option value="">Select contributor…</option>
                      {allContributors
                        .filter(c => !s.subtask_assignments?.find((a: any) => a.contributor_id === c.id))
                        .map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      }
                    </select>
                    <button onClick={() => handleAssign(s.id)}
                            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg">
                      Add
                    </button>
                    <button onClick={() => setAssigningId(null)}
                            className="text-xs text-gray-400">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssigningId(s.id)}
                    className="text-xs text-indigo-500 hover:text-indigo-700 mt-1"
                  >
                    + Assign contributor
                  </button>
                )}
              </div>
            </div>
          )) : (
            <div className="px-4 py-3 text-xs text-gray-400 italic">No sections yet.</div>
          )}

          {/* Add subtask */}
          {addingSub ? (
            <form
              action={async (fd) => {
                await createSubtask(task.id, projectId, fd)
                setAddingSub(false)
                router.refresh()
              }}
              className="px-4 py-3 bg-indigo-50 space-y-2"
            >
              <input name="title" required placeholder="Section title *"
                     className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
              <div className="flex gap-2">
                <input type="date" name="due_date"
                       className="text-xs border border-gray-200 rounded-lg px-3 py-2
                                  focus:outline-none" />
                <button type="submit"
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">
                  Add
                </button>
                <button type="button" onClick={() => setAddingSub(false)}
                        className="text-xs text-gray-400">Cancel</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAddingSub(true)}
              className="w-full text-xs text-indigo-600 hover:text-indigo-800 py-3 px-4
                         text-left hover:bg-gray-50 transition-colors"
            >
              + Add section
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────

export default function ProjectAdminPortal({
  project, tasks, notes, members, allContributors, recentUpdates, contributorId,
}: {
  project:          any
  tasks:            any[]
  notes:            any[]
  members:          any[]
  allContributors:  any[]
  recentUpdates:    any[]
  contributorId:    string
}) {
  const router       = useRouter()
  const [addingTask, setAddingTask] = useState(false)
  const [addingNote, setAddingNote] = useState(false)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

      {/* Tasks (2/3) */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Tasks
            <span className="ml-1.5 text-gray-400 font-normal">({tasks.length})</span>
          </h2>
          <button
            onClick={() => setAddingTask(v => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {addingTask ? 'Cancel' : '+ Add task'}
          </button>
        </div>

        {/* New task form */}
        {addingTask && (
          <form
            action={async (fd) => {
              await createTask(project.id, fd)
              setAddingTask(false)
              router.refresh()
            }}
            className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3"
          >
            <input name="title" required placeholder="Task name *"
                   className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                              focus:outline-none focus:border-indigo-400" />
            <textarea name="description" rows={2} placeholder="Description (optional)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                 focus:outline-none focus:border-indigo-400 resize-none" />
            <div className="flex gap-2">
              <input type="date" name="due_date"
                     className="text-sm border border-gray-200 rounded-xl px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
              <button type="submit"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                Create
              </button>
            </div>
          </form>
        )}

        {tasks.length > 0 ? tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            allContributors={allContributors}
            projectId={project.id}
          />
        )) : (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-400">No tasks yet.</p>
            <button onClick={() => setAddingTask(true)}
                    className="mt-2 text-sm text-indigo-600 font-medium hover:underline">
              Add the first task →
            </button>
          </div>
        )}
      </div>

      {/* Sidebar (1/3) */}
      <div className="space-y-4">

        {/* Team */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Team ({members.length})
          </h3>
          <div className="space-y-2">
            {members.map((m: any) => {
              const c = m.contributors
              if (!c) return null
              return (
                <div key={m.contributor_id} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center
                                  justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                    {c.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                  </div>
                  {m.role === 'admin' && (
                    <span className="text-xs text-indigo-600 font-medium">admin</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Notes</h3>
            <button onClick={() => setAddingNote(v => !v)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              {addingNote ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {addingNote && (
            <form
              action={async (fd) => {
                await addProjectNote(project.id, fd)
                setAddingNote(false)
                router.refresh()
              }}
              className="mb-3 space-y-2"
            >
              <textarea name="content" required rows={3}
                        placeholder="Write a note…"
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2
                                   focus:outline-none focus:border-indigo-400 resize-none" />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" name="is_pinned" value="true" className="rounded" />
                  Pin note
                </label>
                <button type="submit"
                        className="ml-auto bg-indigo-600 text-white px-3 py-1.5 rounded-lg
                                   text-xs font-semibold">
                  Save
                </button>
              </div>
            </form>
          )}

          {notes.length > 0 ? notes.map(note => (
            <div key={note.id}
                 className="text-xs text-gray-600 border-l-2 border-gray-200
                            pl-2.5 py-1 leading-relaxed mb-2">
              {note.is_pinned && <span className="mr-1">📌</span>}
              {note.content}
              <span className="block text-gray-400 mt-0.5">
                {new Date(note.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric',
                })}
              </span>
            </div>
          )) : (
            <p className="text-xs text-gray-400 italic">No notes yet.</p>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent activity</h3>
          {recentUpdates.length > 0 ? recentUpdates.slice(0, 10).map((u: any) => {
            const sa   = u.subtask_assignments
            const who  = sa?.contributors?.name
            const what = sa?.subtasks?.title
            const proj = sa?.subtasks?.tasks?.title
            return (
              <div key={u.id} className="flex gap-2.5 mb-3 last:mb-0">
                <span className="text-sm">💬</span>
                <div>
                  <p className="text-xs text-gray-700 leading-snug">
                    <span className="font-medium">{who}</span>
                    {' updated '}
                    <span className="font-medium">{what}</span>
                    {proj && <span className="text-gray-400"> · {proj}</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 italic">
                    "{u.content}"
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">{fmt(u.created_at)}</p>
                </div>
              </div>
            )
          }) : (
            <p className="text-xs text-gray-400 italic">No activity yet.</p>
          )}
        </div>

      </div>
    </div>
  )
}
