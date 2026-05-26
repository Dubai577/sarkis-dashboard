'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTask, createSubtask, assignContributorToSubtask,
         removeSubtaskAssignment } from '@/app/actions/tasks'
import { addProjectNote } from '@/app/actions/portalNotes'

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-green-100 text-green-700',
}

function fmt(d: string | null) {
  if (!d) return null
  const date = new Date(d)
  if (isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center
                    text-xs font-bold text-white flex-shrink-0"
         style={{ backgroundColor: color }}>
      {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
    </div>
  )
}

// ── Team member card ─────────────────────────────────────────────

function TeamMemberCard({
  m, projectId, projectColor, onRemove,
}: {
  m: any; projectId: string; projectColor: string; onRemove: () => void
}) {
  const c = m.contributors
  if (!c) return null

  const [editing,  setEditing]  = useState(false)
  const [showPIN,  setShowPIN]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirm,  setConfirm]  = useState(false)

  const [name,      setName]      = useState(c.name ?? '')
  const [roleName,  setRoleName]  = useState(c.role_name ?? '')
  const [email,     setEmail]     = useState(c.email ?? '')
  const [phone,     setPhone]     = useState(c.phone ?? '')

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/portal/admin/contributors/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, name, role_name: roleName, email, phone }),
    })
    setSaving(false)
    setEditing(false)
  }

  async function handleRemove() {
    if (!confirm) { setConfirm(true); return }
    setRemoving(true)
    const res = await fetch(
      `/api/portal/admin/contributors/${c.id}?projectId=${projectId}`,
      { method: 'DELETE' }
    )
    if (res.ok) onRemove()
    setRemoving(false)
  }

  if (editing) {
    return (
      <div className="border-b border-gray-100 last:border-0 py-4">
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 font-medium">Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                     className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium">Role / Title</label>
              <input value={roleName} onChange={e => setRoleName(e.target.value)}
                     placeholder="e.g. Developer"
                     className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 font-medium">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                     className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                     className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg
                               font-medium disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
                    className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border-b border-gray-100 last:border-0 py-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Avatar name={name} color={projectColor} />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-800">{name}</p>
              {m.role === 'admin' && (
                <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5
                                  rounded-full font-medium">admin</span>
              )}
            </div>
            {roleName && <p className="text-xs text-indigo-500 mt-0.5">{roleName}</p>}
            {email && <p className="text-xs text-gray-400 mt-0.5">{email}</p>}
            {phone && <p className="text-xs text-gray-400">{phone}</p>}
          </div>
        </div>
        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-indigo-600 border border-gray-200
                             px-2 py-1 rounded-lg hover:border-indigo-300 transition-colors">
            Edit
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors
                       ${confirm
                         ? 'bg-red-500 text-white border-red-500'
                         : 'text-red-400 border-gray-200 hover:border-red-300'}`}
          >
            {removing ? '…' : confirm ? 'Confirm' : 'Remove'}
          </button>
        </div>
      </div>

      {/* PIN */}
      <div className="flex items-center gap-2 mt-1.5 pl-10">
        <span className="text-xs text-gray-400">PIN:</span>
        <span className={`font-mono text-xs font-bold tracking-widest
                          ${showPIN ? 'text-gray-800' : 'text-gray-300 select-none'}`}>
          {showPIN ? (c.pin ?? '——') : '••••'}
        </span>
        <button onClick={() => setShowPIN(v => !v)}
                className="text-xs text-indigo-500 hover:text-indigo-700">
          {showPIN ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}

// ── Subtask row (admin) ──────────────────────────────────────────

function SubtaskAdminRow({
  s, allContributors, taskId, projectId,
}: {
  s: any; allContributors: any[]; taskId: string; projectId: string
}) {
  const router = useRouter()
  const [editing,     setEditing]     = useState(false)
  const [title,       setTitle]       = useState(s.title)
  const [dueDate,     setDueDate]     = useState(s.due_date ?? '')
  const [description, setDescription] = useState(s.description ?? '')
  const [assigning,   setAssigning]   = useState(false)
  const [selectedC,   setSelectedC]   = useState('')
  const [saving,      setSaving]      = useState(false)

  const assigned = (s.subtask_assignments ?? []).map((a: any) => a.contributor_id)
  const available = allContributors.filter(c => !assigned.includes(c.id))

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/portal/admin/subtasks/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, due_date: dueDate }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    await fetch(`/api/portal/admin/subtasks/${s.id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleAssign() {
    if (!selectedC) return
    await assignContributorToSubtask(s.id, selectedC, taskId, projectId)
    setAssigning(false)
    setSelectedC('')
    router.refresh()
  }

  async function handleUnassign(contributorId: string) {
    await removeSubtaskAssignment(s.id, contributorId, taskId, projectId)
    router.refresh()
  }

  if (editing) {
    return (
      <div className="px-4 py-3 bg-indigo-50 border-t border-gray-100 space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
               className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                          focus:outline-none focus:border-indigo-400" />
        <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={2} placeholder="Description (optional)"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                             focus:outline-none focus:border-indigo-400 resize-none" />
        <div className="flex items-center gap-2">
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                 className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
          <button onClick={handleSave} disabled={saving}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium
                             disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 border-t border-gray-50 group/sub">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
          {dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {fmt(dueDate)}</p>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-indigo-600 px-1.5 py-0.5">Edit</button>
          <button onClick={handleDelete}
                  className="text-xs text-red-300 hover:text-red-500 px-1.5 py-0.5">Del</button>
        </div>
      </div>

      {/* Assignments */}
      <div className="mt-2 space-y-1.5">
        {(s.subtask_assignments ?? []).map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 group/asgn">
            <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center
                            text-indigo-700 text-xs font-bold flex-shrink-0">
              {a.contributors?.name?.[0]}
            </div>
            <span className="text-xs text-gray-700 flex-1">{a.contributors?.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[a.status]}`}>
              {a.status.replace('_', ' ')}
            </span>
            {a.subtask_updates?.length > 0 && (
              <span className="text-xs text-gray-400 italic line-clamp-1 max-w-[120px]">
                "{a.subtask_updates[a.subtask_updates.length - 1].content}"
              </span>
            )}
            <button
              onClick={() => handleUnassign(a.contributor_id)}
              className="text-gray-300 hover:text-red-400 text-xs opacity-0
                         group-hover/asgn:opacity-100 transition-opacity"
            >×</button>
          </div>
        ))}

        {/* Assign */}
        {assigning ? (
          <div className="flex items-center gap-2 mt-1">
            <select value={selectedC} onChange={e => setSelectedC(e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white flex-1 focus:outline-none">
              <option value="">Select contributor…</option>
              {available.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}{c.role_name ? ` (${c.role_name})` : ''}</option>
              ))}
            </select>
            <button onClick={handleAssign}
                    className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg">Add</button>
            <button onClick={() => setAssigning(false)} className="text-xs text-gray-400">✕</button>
          </div>
        ) : available.length > 0 && (
          <button onClick={() => setAssigning(true)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 mt-1">
            + Assign contributor
          </button>
        )}
      </div>
    </div>
  )
}

// ── Task card ────────────────────────────────────────────────────

function TaskCard({
  task, allContributors, projectId,
}: {
  task: any; allContributors: any[]; projectId: string
}) {
  const router = useRouter()
  const [expanded,  setExpanded]  = useState(false)
  const [editing,   setEditing]   = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [title,     setTitle]     = useState(task.title)
  const [dueDate,   setDueDate]   = useState(task.due_date ?? '')
  const [saving,    setSaving]    = useState(false)

  const totalSubs = task.subtasks?.length ?? 0
  const doneSubs  = (task.subtasks ?? []).filter((s: any) =>
    (s.subtask_assignments ?? []).length > 0 &&
    (s.subtask_assignments ?? []).every((a: any) => a.status === 'completed')
  ).length

  async function handleSaveTask() {
    setSaving(true)
    await fetch(`/api/portal/admin/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, due_date: dueDate }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDeleteTask() {
    await fetch(`/api/portal/admin/tasks/${task.id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Task header */}
      {editing ? (
        <div className="p-4 bg-indigo-50 space-y-2">
          <input value={title} onChange={e => setTitle(e.target.value)}
                 className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2
                            focus:outline-none focus:border-indigo-400" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Due:</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                   className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
            <button onClick={handleSaveTask} disabled={saving}
                    className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium
                               disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-4 hover:bg-gray-50 transition-colors group/task">
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-sm font-semibold text-gray-900 truncate">{title}</span>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            {dueDate && <span className="text-xs text-gray-400">{fmt(dueDate)}</span>}
            {totalSubs > 0 && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {doneSubs}/{totalSubs}
              </span>
            )}
            <button onClick={() => setEditing(true)}
                    className="text-xs text-gray-300 hover:text-indigo-600 opacity-0
                               group-hover/task:opacity-100 transition-opacity border border-gray-200
                               px-2 py-0.5 rounded-lg">
              Edit
            </button>
            <button onClick={handleDeleteTask}
                    className="text-xs text-red-300 hover:text-red-500 opacity-0
                               group-hover/task:opacity-100 transition-opacity">
              Del
            </button>
          </div>
        </div>
      )}

      {/* Subtasks */}
      {expanded && (
        <div>
          {(task.subtasks ?? []).map((s: any) => (
            <SubtaskAdminRow
              key={s.id}
              s={s}
              allContributors={allContributors}
              taskId={task.id}
              projectId={projectId}
            />
          ))}

          {/* Add subtask */}
          {addingSub ? (
            <form
              action={async (fd) => {
                await createSubtask(task.id, projectId, fd)
                setAddingSub(false)
                router.refresh()
              }}
              className="px-4 py-3 bg-indigo-50 border-t border-gray-100 space-y-2"
            >
              <input name="title" required placeholder="Section title *"
                     className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                                focus:outline-none focus:border-indigo-400" />
              <textarea name="description" rows={2} placeholder="Description (optional)"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2
                                   focus:outline-none focus:border-indigo-400 resize-none" />
              <div className="flex gap-2">
                <input type="date" name="due_date"
                       className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none" />
                <button type="submit"
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold">
                  Add
                </button>
                <button type="button" onClick={() => setAddingSub(false)}
                        className="text-sm text-gray-400">Cancel</button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAddingSub(true)}
              className="w-full text-sm text-indigo-600 hover:text-indigo-800 py-3 px-4
                         text-left hover:bg-gray-50 transition-colors border-t border-gray-100"
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
  project:         any
  tasks:           any[]
  notes:           any[]
  members:         any[]
  allContributors: any[]
  recentUpdates:   any[]
  contributorId:   string
}) {
  const router = useRouter()
  const [memberList, setMemberList] = useState(members)
  const [addingTask, setAddingTask] = useState(false)
  const [addingNote, setAddingNote] = useState(false)

  return (
    <div className="space-y-5">

      {/* Dashboard link */}
      <div className="flex justify-end">
        <Link
          href={`/portal/project/${project.id}/dashboard`}
          className="inline-flex items-center gap-2 text-sm bg-indigo-600 text-white
                     px-4 py-2 rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
        >
          📊 View full dashboard
        </Link>
      </div>

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

          {addingTask && (
            <form
              action={async (fd) => {
                await createTask(project.id, fd)
                setAddingTask(false)
                router.refresh()
              }}
              className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3"
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
            <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
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
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">
              Team ({memberList.length})
            </h3>
            <p className="text-xs text-gray-400 mb-3">Hover a member to edit or remove</p>
            {memberList.length > 0 ? memberList.map((m: any) => (
              <TeamMemberCard
                key={m.contributor_id}
                m={m}
                projectId={project.id}
                projectColor={project.color}
                onRemove={() =>
                  setMemberList(prev => prev.filter(x => x.contributor_id !== m.contributor_id))
                }
              />
            )) : (
              <p className="text-xs text-gray-400 italic">No members yet.</p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
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
                          className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2
                                     focus:outline-none focus:border-indigo-400 resize-none" />
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" name="is_pinned" value="true" className="rounded" />
                    Pin
                  </label>
                  <select name="visibility" defaultValue="admin_only"
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1
                                     bg-white focus:outline-none">
                    <option value="admin_only">Admin only</option>
                    <option value="contributors">Everyone</option>
                  </select>
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
                   className="text-sm text-gray-600 border-l-2 border-gray-200
                              pl-3 py-1 leading-relaxed mb-2">
                {note.is_pinned && <span className="mr-1">📌</span>}
                {note.visibility === 'contributors' && (
                  <span className="text-xs bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded mr-1">
                    shared
                  </span>
                )}
                {note.content}
                <span className="block text-xs text-gray-400 mt-0.5">
                  {fmt(note.created_at)}
                </span>
              </div>
            )) : (
              <p className="text-sm text-gray-400 italic">No notes yet.</p>
            )}
          </div>

          {/* Recent activity */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent activity</h3>
            {recentUpdates.length > 0 ? recentUpdates.slice(0, 10).map((u: any) => {
              const sa  = u.subtask_assignments
              const who = sa?.contributors?.name
              const what = sa?.subtasks?.title
              const task = sa?.subtasks?.tasks?.title
              return (
                <div key={u.id} className="flex gap-2.5 mb-3 last:mb-0">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center
                                  text-xs font-bold text-indigo-600 flex-shrink-0">
                    {who?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-snug">
                      <span className="font-semibold">{who}</span>
                      {' updated '}
                      <span className="font-medium">{what}</span>
                      {task && <span className="text-gray-400"> · {task}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 italic line-clamp-1">
                      "{u.content}"
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">{fmt(u.created_at)}</p>
                  </div>
                </div>
              )
            }) : (
              <p className="text-sm text-gray-400 italic">No activity yet.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
