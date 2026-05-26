'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addProjectMember, updateMemberRole, removeProjectMember, createAndAddContributor } from '@/app/actions/members'
import { updateContributor } from '@/app/actions/contributors'

const FREQ_LABELS: Record<string, string> = {
  daily:           'Daily',
  every_other_day: 'Every other day',
  weekly:          'Weekly',
}

interface Member {
  contributor_id: string
  role:           string
  contributors:   {
    id:              string
    name:            string
    email:           string | null
    phone:           string | null
    pin:             string | null
    role_name:       string | null
    notif_frequency: string
  } | null
}

interface Contributor {
  id:    string
  name:  string
  email: string | null
}

export default function ProjectMembers({
  projectId,
  members,
  allContributors,
}: {
  projectId:       string
  members:         Member[]
  allContributors: Contributor[]
}) {
  const router      = useRouter()
  const [adding, setAdding]           = useState(false)
  const [addTab, setAddTab]           = useState<'existing'|'new'>('existing')
  const [selectedId, setSelectedId]   = useState('')
  const [selectedRole, setSelectedRole] = useState<'contributor'|'admin'>('contributor')
  const [loading, setLoading]         = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)

  const assignedIds  = members.map(m => m.contributor_id)
  const unassigned   = allContributors.filter(c => !assignedIds.includes(c.id))

  async function handleAdd() {
    if (!selectedId) return
    setLoading(true)
    await addProjectMember(projectId, selectedId, selectedRole)
    setSelectedId('')
    setSelectedRole('contributor')
    setAdding(false)
    setLoading(false)
    router.refresh()
  }

  async function handleRoleChange(contributorId: string, role: 'contributor' | 'admin') {
    await updateMemberRole(projectId, contributorId, role)
    router.refresh()
  }

  async function handleRemove(contributorId: string) {
    await removeProjectMember(projectId, contributorId)
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          Team
          <span className="ml-1.5 text-gray-400 font-normal">({members.length})</span>
        </h3>
        <button
          onClick={() => setAdding(v => !v)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {adding ? 'Cancel' : '+ Add member'}
        </button>
      </div>

      {/* Add member form */}
      {adding && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3 space-y-2">
          {/* Tabs */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            {(['existing', 'new'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setAddTab(t)}
                className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors
                           ${addTab === t ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t === 'existing' ? 'Add existing' : '+ New contributor'}
              </button>
            ))}
          </div>

          {addTab === 'existing' ? (
            <>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:border-indigo-400"
              >
                <option value="">Select contributor…</option>
                {unassigned.map(c => (
                  <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
                ))}
              </select>
              <div className="flex gap-2">
                {(['contributor', 'admin'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSelectedRole(r)}
                    className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors
                               ${selectedRole === r
                                 ? 'bg-indigo-600 text-white'
                                 : 'bg-white border border-gray-200 text-gray-600'}`}
                  >
                    {r === 'admin' ? '⭐ Project admin' : 'Contributor'}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAdd}
                disabled={!selectedId || loading}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs
                           font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Adding…' : 'Add to project'}
              </button>
            </>
          ) : (
            <form
              action={async (fd) => {
                await createAndAddContributor(projectId, fd)
                setAdding(false)
                router.refresh()
              }}
              className="space-y-2"
            >
              <input
                name="name"
                required
                placeholder="Full name *"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:border-indigo-400"
              />
              <input
                name="role_name"
                placeholder="Role / title (e.g. Developer)"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:border-indigo-400"
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:border-indigo-400"
              />
              <input
                name="phone"
                placeholder="Phone"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                           bg-white focus:outline-none focus:border-indigo-400"
              />
              <div className="flex gap-2">
                {(['contributor', 'admin'] as const).map(r => (
                  <label
                    key={r}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs
                               border border-gray-200 rounded-lg py-1.5 cursor-pointer
                               has-[:checked]:bg-indigo-600 has-[:checked]:text-white
                               has-[:checked]:border-indigo-600 text-gray-600 bg-white transition-colors"
                  >
                    <input type="radio" name="role" value={r} defaultChecked={r === 'contributor'} className="sr-only" />
                    {r === 'admin' ? '⭐ Project admin' : 'Contributor'}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 italic">A PIN will be auto-generated for login.</p>
              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs
                           font-semibold hover:bg-indigo-700 transition-colors"
              >
                Create &amp; add to project
              </button>
            </form>
          )}
        </div>
      )}

      {/* Member list */}
      {members.length > 0 ? (
        <div className="space-y-2">
          {members.map(m => {
            const c = m.contributors
            if (!c) return null
            const isEditing = editingId === m.contributor_id

            return (
              <div key={m.contributor_id}>
                <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center
                                  justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                    {c.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">{c.name}</p>
                    {c.role_name && (
                      <p className="text-xs text-indigo-500">{c.role_name}</p>
                    )}
                    {c.email && (
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    )}
                  </div>

                  {/* Role toggle */}
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m.contributor_id, e.target.value as any)}
                    className={`text-xs border rounded-lg px-2 py-1 focus:outline-none
                                ${m.role === 'admin'
                                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                  : 'border-gray-200 bg-white text-gray-600'}`}
                  >
                    <option value="contributor">Contributor</option>
                    <option value="admin">Project admin</option>
                  </select>

                  <button
                    onClick={() => setEditingId(isEditing ? null : m.contributor_id)}
                    className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Edit contributor"
                  >
                    ✏
                  </button>

                  <button
                    onClick={() => handleRemove(m.contributor_id)}
                    className="text-gray-300 hover:text-red-400 transition-colors text-sm"
                    title="Remove from project"
                  >
                    ×
                  </button>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <form
                    action={updateContributor.bind(null, c.id)}
                    className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mt-1 mb-2 space-y-2"
                  >
                    <input
                      name="name"
                      required
                      defaultValue={c.name}
                      placeholder="Name *"
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                 focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      name="role_name"
                      defaultValue={c.role_name ?? ''}
                      placeholder="Role (e.g. Social Media Lead)"
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                 focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      name="email"
                      type="email"
                      defaultValue={c.email ?? ''}
                      placeholder="Email"
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                 focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={c.phone ?? ''}
                      placeholder="Phone"
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                 focus:outline-none focus:border-indigo-400"
                    />
                    <select
                      name="notif_frequency"
                      defaultValue={c.notif_frequency ?? 'weekly'}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                                 focus:outline-none focus:border-indigo-400 bg-white"
                    >
                      {Object.entries(FREQ_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-600 text-white py-1.5 rounded-lg text-xs
                                   font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600 px-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No members yet.</p>
      )}
    </div>
  )
}
