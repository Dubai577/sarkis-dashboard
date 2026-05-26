'use client'

import { useState } from 'react'
import {
  createContributor,
  updateContributor,
  deleteContributor,
  resetPIN,
} from '@/app/actions/contributors'
import { NotifFrequency } from '@/lib/types/portal'

const FREQ_LABELS: Record<NotifFrequency, string> = {
  daily:           'Daily',
  every_other_day: 'Every other day',
  weekly:          'Weekly',
}

interface Contributor {
  id:              string
  name:            string
  email:           string | null
  phone:           string | null
  role_name:       string | null
  pin:             string | null
  notif_frequency: string
  created_at:      string
}

interface Project {
  id:    string
  name:  string
  color: string
}

// ── Add / Edit form ──────────────────────────────────────────────

function ContributorForm({
  defaults,
  action,
  onDelete,
  contributorId,
  onCancel,
}: {
  defaults?:      Partial<Contributor>
  action:         (fd: FormData) => Promise<void>
  onDelete?:      () => void
  contributorId?: string
  onCancel:       () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            name="name"
            required
            defaultValue={defaults?.name}
            placeholder="e.g. Mary Girgis"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={defaults?.email ?? ''}
            placeholder="mary@example.com"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={defaults?.phone ?? ''}
            placeholder="+1 (555) 000-0000"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Role / Title</label>
          <input
            name="role_name"
            defaultValue={defaults?.role_name ?? ''}
            placeholder="e.g. Social Media Lead, Developer"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Email reminders
          </label>
          <select
            name="notif_frequency"
            defaultValue={defaults?.notif_frequency ?? 'weekly'}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                       focus:outline-none focus:border-indigo-400 bg-white"
          >
            {Object.entries(FREQ_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => confirming ? onDelete() : setConfirming(true)}
              className={`text-sm px-3 py-2 rounded-xl font-medium transition-colors
                         ${confirming
                           ? 'bg-red-500 text-white'
                           : 'text-red-400 hover:bg-red-50 border border-red-200'}`}
            >
              {confirming ? 'Confirm delete' : 'Delete'}
            </button>
          )}
          <button
            type="submit"
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm
                       font-semibold hover:bg-indigo-700 transition-colors"
          >
            {contributorId ? 'Save' : 'Add contributor'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Contributor row ──────────────────────────────────────────────

function ContributorRow({
  contributor,
  projects,
}: {
  contributor: Contributor
  projects:    Project[]
}) {
  const [editing, setEditing]     = useState(false)
  const [showPIN, setShowPIN]     = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    await resetPIN(contributor.id)
    setResetting(false)
  }

  async function handleDelete() {
    await deleteContributor(contributor.id)
  }

  if (editing) {
    return (
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Editing {contributor.name}
        </h3>
        <ContributorForm
          defaults={contributor}
          action={updateContributor.bind(null, contributor.id)}
          onDelete={handleDelete}
          contributorId={contributor.id}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center
                          justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
            {contributor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{contributor.name}</p>
            {contributor.role_name && (
              <p className="text-xs text-indigo-500 font-medium mt-0.5">{contributor.role_name}</p>
            )}
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {contributor.email && (
                <span className="text-xs text-gray-400">{contributor.email}</span>
              )}
              {contributor.phone && (
                <span className="text-xs text-gray-400">{contributor.phone}</span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setEditing(true)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200
                     px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0"
        >
          Edit
        </button>
      </div>

      {/* PIN + frequency row */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-50 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">PIN:</span>
          <span className={`font-mono text-sm font-bold tracking-widest
                            ${showPIN ? 'text-gray-900' : 'text-gray-300 select-none'}`}>
            {showPIN ? (contributor.pin ?? '——————') : '••••••'}
          </span>
          <button
            onClick={() => setShowPIN(v => !v)}
            className="text-xs text-indigo-500 hover:text-indigo-700"
          >
            {showPIN ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          >
            {resetting ? 'Resetting…' : 'Reset'}
          </button>
        </div>

        <span className="text-xs text-gray-400">
          Reminders: {FREQ_LABELS[contributor.notif_frequency as NotifFrequency]}
        </span>

        <span className="text-xs text-gray-300">
          Added {new Date(contributor.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </span>
      </div>
    </div>
  )
}

// ── Main list ────────────────────────────────────────────────────

export default function ContributorList({
  contributors,
  projects,
}: {
  contributors: Contributor[]
  projects:     Project[]
}) {
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = contributors.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  return (
    <div className="space-y-3">
      {/* Search + Add */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search contributors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:border-indigo-400 bg-white"
        />
        <button
          onClick={() => setAdding(v => !v)}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm
                     font-semibold hover:bg-indigo-700 transition-colors whitespace-nowrap"
        >
          {adding ? 'Cancel' : '+ Add contributor'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">New contributor</h3>
          <ContributorForm
            action={createContributor}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* List */}
      {filtered.length > 0 ? (
        filtered.map(c => (
          <ContributorRow key={c.id} contributor={c} projects={projects} />
        ))
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">👥</p>
          <p className="font-medium text-gray-500">
            {search ? 'No contributors match your search.' : 'No contributors yet.'}
          </p>
          {!search && (
            <button
              onClick={() => setAdding(true)}
              className="mt-3 text-sm text-indigo-600 font-medium hover:underline"
            >
              Add your first contributor →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
