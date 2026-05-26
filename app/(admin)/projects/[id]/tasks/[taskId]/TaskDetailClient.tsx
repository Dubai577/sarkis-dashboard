'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createSubtask, updateSubtask, deleteSubtask,
  assignContributorToSubtask, removeSubtaskAssignment, updateSubtaskAssignmentStatus,
  addDependency, removeDependency,
  addResource, deleteResource,
  updateTask, deleteTask,
} from '@/app/actions/tasks'

// ── Types ────────────────────────────────────────────────────────

interface Contributor { id: string; name: string; email: string | null; role_name?: string | null }
interface SubtaskAssignment {
  id: string; status: string; completed_at: string | null
  contributor_id: string
  contributors: { id: string; name: string; role_name?: string | null } | null
}
interface Subtask {
  id: string; title: string; description: string | null; due_date: string | null
  subtask_assignments: SubtaskAssignment[]
}
interface Task {
  id: string; title: string; description: string | null; due_date: string | null; project_id: string
}
interface Resource {
  id: string; type: string; content: string; label: string | null
  is_admin_post: boolean; contributors: { name: string } | null; created_at: string
}

function fmt(d: string | null) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
}

// ── Subtask row ──────────────────────────────────────────────────

function SubtaskRow({
  subtask, contributors, projectId, taskId,
}: {
  subtask: Subtask; contributors: Contributor[]; projectId: string; taskId: string
}) {
  const router = useRouter()
  const [editing,    setEditing]    = useState(false)
  const [assigning,  setAssigning]  = useState(false)
  const [selectedId, setSelectedId] = useState('')

  const assigned   = subtask.subtask_assignments.map(a => a.contributor_id)
  const unassigned = contributors.filter(c => !assigned.includes(c.id))

  async function handleAssign() {
    if (!selectedId) return
    await assignContributorToSubtask(subtask.id, selectedId, taskId, projectId)
    setSelectedId('')
    setAssigning(false)
  }

  async function handleRemove(contributorId: string) {
    await removeSubtaskAssignment(subtask.id, contributorId, taskId, projectId)
    router.refresh()
  }

  async function handleStatusChange(assignmentId: string, status: string) {
    await updateSubtaskAssignmentStatus(assignmentId, status, taskId, projectId)
    router.refresh()
  }

  async function handleDelete() {
    await deleteSubtask(subtask.id, taskId, projectId)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
        <form action={async (fd) => {
          await updateSubtask(subtask.id, taskId, projectId, fd)
          setEditing(false)
          router.refresh()
        }} className="space-y-3">
          <input
            name="title"
            required
            defaultValue={subtask.title}
            placeholder="Section title *"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium
                       focus:outline-none focus:border-indigo-400"
          />
          <textarea
            name="description"
            rows={2}
            defaultValue={subtask.description ?? ''}
            placeholder="Description (optional)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400 resize-none"
          />
          <div className="flex items-center gap-3">
            <input
              type="date"
              name="due_date"
              defaultValue={subtask.due_date ?? ''}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2
                         focus:outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{subtask.title}</p>
          {subtask.description && (
            <p className="text-xs text-gray-500 mt-0.5">{subtask.description}</p>
          )}
          {subtask.due_date && (
            <p className="text-xs text-gray-400 mt-0.5">Due {fmt(subtask.due_date)}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200
                       px-2 py-1 rounded-lg hover:bg-white transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Assigned contributors */}
      <div className="flex flex-wrap gap-2">
        {subtask.subtask_assignments.map(a => (
          <div key={a.id}
               className="flex items-center gap-1.5 bg-white border border-gray-200
                          rounded-xl px-3 py-1.5">
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-700">
                {a.contributors?.name}
              </span>
              {a.contributors?.role_name && (
                <span className="text-xs text-indigo-500 ml-1">
                  · {a.contributors.role_name}
                </span>
              )}
            </div>
            <select
              value={a.status}
              onChange={e => handleStatusChange(a.id, e.target.value)}
              className={`text-xs border-0 rounded-lg px-1.5 py-0.5 font-medium
                          focus:outline-none focus:ring-1 focus:ring-indigo-300 cursor-pointer
                          ${STATUS_COLOR[a.status]}`}
            >
              <option value="pending">pending</option>
              <option value="in_progress">in progress</option>
              <option value="completed">completed</option>
            </select>
            <button
              onClick={() => handleRemove(a.contributor_id)}
              className="text-gray-300 hover:text-red-400 ml-0.5 text-xs leading-none"
            >
              ×
            </button>
          </div>
        ))}

        {unassigned.length > 0 && (
          assigning ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
              >
                <option value="">Select contributor…</option>
                {unassigned.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.role_name ? ` (${c.role_name})` : ''}
                  </option>
                ))}
              </select>
              <button onClick={handleAssign}
                      className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg">
                Add
              </button>
              <button onClick={() => setAssigning(false)}
                      className="text-xs text-gray-400">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAssigning(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-dashed
                         border-indigo-300 rounded-full px-3 py-1"
            >
              + Assign
            </button>
          )
        )}
      </div>
    </div>
  )
}

// ── Main client component ────────────────────────────────────────

export default function TaskDetailClient({
  task, subtasks, allContributors, allProjectTasks,
  dependencies, blocking, resources, projectId, projectColor,
}: {
  task:             Task
  subtasks:         Subtask[]
  allContributors:  Contributor[]
  allProjectTasks:  { id: string; title: string }[]
  dependencies:     any[]
  blocking:         any[]
  resources:        Resource[]
  projectId:        string
  projectColor:     string
}) {
  const router = useRouter()
  const [editingTask,   setEditingTask]   = useState(false)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [addingDep,     setAddingDep]     = useState(false)
  const [depTaskId,     setDepTaskId]     = useState('')
  const [addingRes,     setAddingRes]     = useState(false)
  const [resType,       setResType]       = useState<'link'|'note'>('link')
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDel,    setConfirmDel]    = useState(false)

  const availableDeps = allProjectTasks.filter(
    t => !dependencies.find((d: any) => d.depends_on_task_id === t.id)
  )

  async function handleAddDep() {
    if (!depTaskId) return
    await addDependency(task.id, depTaskId, projectId)
    setDepTaskId('')
    setAddingDep(false)
  }

  async function handleDelete() {
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    await deleteTask(task.id, projectId)
  }

  return (
    <div className="space-y-5">

      {/* ── Task header ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        {editingTask ? (
          <form action={async (fd) => {
            await updateTask(task.id, projectId, fd)
            setEditingTask(false)
            router.refresh()
          }} className="space-y-4">
            <input name="title" required defaultValue={task.title}
                   className="w-full text-xl font-bold border-b border-gray-200 pb-1
                              focus:outline-none focus:border-indigo-400" />
            <textarea name="description" rows={2} defaultValue={task.description ?? ''}
                      placeholder="Description"
                      className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2
                                 focus:outline-none focus:border-indigo-400 resize-none" />
            <input type="date" name="due_date" defaultValue={task.due_date ?? ''}
                   className="text-sm border border-gray-200 rounded-xl px-3 py-2
                              focus:outline-none focus:border-indigo-400" />
            <div className="flex gap-3">
              <button type="submit"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                Save
              </button>
              <button type="button" onClick={() => setEditingTask(false)}
                      className="text-sm text-gray-400">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{task.title}</h1>
              {task.description && (
                <p className="text-sm text-gray-500 mt-1">{task.description}</p>
              )}
              {task.due_date && (
                <p className="text-xs text-gray-400 mt-1.5">Due {fmt(task.due_date)}</p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditingTask(true)}
                      className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg
                                 text-gray-500 hover:bg-gray-50">
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                           ${confirmDel
                             ? 'bg-red-500 text-white'
                             : 'border border-red-200 text-red-400 hover:bg-red-50'}`}
              >
                {deleting ? 'Deleting…' : confirmDel ? 'Confirm' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Subtasks (2/3) ── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              Sections / subtasks
              <span className="ml-2 text-gray-400 font-normal">({subtasks.length})</span>
            </h2>
            <button
              onClick={() => setAddingSubtask(v => !v)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {addingSubtask ? 'Cancel' : '+ Add section'}
            </button>
          </div>

          {addingSubtask && (
            <form action={async (fd) => {
              await createSubtask(task.id, projectId, fd)
              setAddingSubtask(false)
              router.refresh()
            }} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
              <input name="title" required placeholder="Section title *"
                     className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                focus:outline-none focus:border-indigo-400" />
              <textarea name="description" rows={2} placeholder="Description (optional)"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                                   focus:outline-none focus:border-indigo-400 resize-none" />
              <div className="flex items-center gap-3">
                <input type="date" name="due_date"
                       className="text-sm border border-gray-200 rounded-xl px-3 py-2
                                  focus:outline-none focus:border-indigo-400" />
                <button type="submit"
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold">
                  Add
                </button>
              </div>
            </form>
          )}

          {subtasks.length > 0 ? subtasks.map(s => (
            <SubtaskRow
              key={s.id}
              subtask={s}
              contributors={allContributors}
              projectId={projectId}
              taskId={task.id}
            />
          )) : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
              <p className="text-sm text-gray-400">No sections yet.</p>
              <button onClick={() => setAddingSubtask(true)}
                      className="mt-2 text-sm text-indigo-600 font-medium hover:underline">
                Add the first section →
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar: Dependencies + Resources (1/3) ── */}
        <div className="space-y-4">

          {/* Dependencies */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Waiting on</h3>
              {availableDeps.length > 0 && (
                <button onClick={() => setAddingDep(v => !v)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  {addingDep ? 'Cancel' : '+ Add'}
                </button>
              )}
            </div>

            {addingDep && (
              <div className="flex gap-2 mb-3">
                <select value={depTaskId} onChange={e => setDepTaskId(e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5
                                   bg-white focus:outline-none">
                  <option value="">Select task…</option>
                  {availableDeps.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <button onClick={handleAddDep}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg">
                  Add
                </button>
              </div>
            )}

            {dependencies.length > 0 ? dependencies.map((d: any) => (
              <div key={d.depends_on_task_id}
                   className="flex items-center justify-between gap-2 py-1.5
                              border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-600">{d.tasks?.title}</span>
                <button
                  onClick={() => removeDependency(task.id, d.depends_on_task_id, projectId)}
                  className="text-xs text-gray-300 hover:text-red-400"
                >×</button>
              </div>
            )) : (
              <p className="text-xs text-gray-400 italic">No dependencies.</p>
            )}

            {blocking.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Blocking:</p>
                {blocking.map((b: any) => (
                  <p key={b.task_id} className="text-xs text-gray-500 py-1">
                    {b.tasks?.title}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Shared resources */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Shared resources</h3>
              <button onClick={() => setAddingRes(v => !v)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                {addingRes ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {addingRes && (
              <form action={async (fd) => {
                await addResource(task.id, projectId, fd)
                setAddingRes(false)
                router.refresh()
              }} className="space-y-2 mb-3">
                <input type="hidden" name="type" value={resType} />
                <div className="flex gap-2">
                  {(['link','note'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setResType(t)}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
                                       ${resType === t
                                         ? 'bg-indigo-600 text-white'
                                         : 'bg-gray-100 text-gray-600'}`}>
                      {t === 'link' ? '🔗 Link' : '📝 Note'}
                    </button>
                  ))}
                </div>
                {resType === 'link' && (
                  <input name="label" placeholder="Label (optional)"
                         className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                    focus:outline-none focus:border-indigo-400" />
                )}
                <input
                  name="content" required
                  placeholder={resType === 'link' ? 'https://…' : 'Your note…'}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                             focus:outline-none focus:border-indigo-400"
                />
                <button type="submit"
                        className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs font-semibold">
                  Save
                </button>
              </form>
            )}

            {resources.length > 0 ? resources.map(r => (
              <div key={r.id}
                   className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm mt-0.5">{r.type === 'link' ? '🔗' : '📝'}</span>
                <div className="flex-1 min-w-0">
                  {r.type === 'link' ? (
                    <a href={r.content} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-indigo-600 hover:underline truncate block">
                      {r.label || r.content}
                    </a>
                  ) : (
                    <p className="text-xs text-gray-600 leading-relaxed">{r.content}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.is_admin_post ? 'You' : r.contributors?.name} · {fmt(r.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => deleteResource(r.id, task.id, projectId)}
                  className="text-xs text-gray-300 hover:text-red-400 flex-shrink-0"
                >×</button>
              </div>
            )) : (
              <p className="text-xs text-gray-400 italic">No resources yet.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
