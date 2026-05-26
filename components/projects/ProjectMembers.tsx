'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addProjectMember, updateMemberRole, removeProjectMember } from '@/app/actions/members'

interface Member {
  contributor_id: string
  role:           string
  contributors:   { id: string; name: string; email: string | null; pin: string | null } | null
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
  const [adding, setAdding]         = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [selectedRole, setSelectedRole] = useState<'contributor'|'admin'>('contributor')
  const [loading, setLoading]       = useState(false)

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
        {unassigned.length > 0 && (
          <button
            onClick={() => setAdding(v => !v)}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {adding ? 'Cancel' : '+ Add member'}
          </button>
        )}
      </div>

      {/* Add member form */}
      {adding && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-3 space-y-2">
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2
                       bg-white focus:outline-none focus:border-indigo-400"
          >
            <option value="">Select contributor…</option>
            {unassigned.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
        </div>
      )}

      {/* Member list */}
      {members.length > 0 ? (
        <div className="space-y-2">
          {members.map(m => {
            const c = m.contributors
            if (!c) return null
            return (
              <div key={m.contributor_id}
                   className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center
                                justify-center text-indigo-700 font-bold text-xs flex-shrink-0">
                  {c.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">{c.name}</p>
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
                  onClick={() => handleRemove(m.contributor_id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm"
                  title="Remove from project"
                >
                  ×
                </button>
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
