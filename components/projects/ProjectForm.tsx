'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProjectStatus } from '@/lib/types/portal'

const COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444',
  '#f97316','#f59e0b','#10b981','#06b6d4',
  '#3b82f6','#14b8a6','#84cc16','#64748b',
]

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'on_track',        label: 'On track'    },
  { value: 'needs_followup',  label: 'Follow up'   },
  { value: 'waiting',         label: 'Waiting'     },
  { value: 'completed',       label: 'Completed'   },
]

interface ProjectFormProps {
  action:   (formData: FormData) => Promise<void>
  defaults?: {
    name?:        string
    description?: string
    status?:      ProjectStatus
    due_date?:    string
    color?:       string
  }
  submitLabel: string
  projectId?:  string   // only for delete button on edit form
  onDelete?:   (id: string) => Promise<void>
}

export default function ProjectForm({
  action,
  defaults = {},
  submitLabel,
  projectId,
  onDelete,
}: ProjectFormProps) {
  const router  = useRouter()
  const [color, setColor]         = useState(defaults.color ?? '#6366f1')
  const [deleting, setDeleting]   = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    if (!projectId || !onDelete) return
    setDeleting(true)
    await onDelete(projectId)
  }

  return (
    <form action={action} className="space-y-5">
      {/* Hidden color field — updated by swatch clicks */}
      <input type="hidden" name="color" value={color} />

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Project name <span className="text-red-400">*</span>
        </label>
        <input
          name="name"
          required
          defaultValue={defaults.name}
          placeholder="e.g. HEMY Bible Studies"
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:border-indigo-400 transition-colors"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Description
        </label>
        <textarea
          name="description"
          defaultValue={defaults.description ?? ''}
          placeholder="What is this project about?"
          rows={3}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                     focus:outline-none focus:border-indigo-400 transition-colors resize-none"
        />
      </div>

      {/* Status + Due date row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
          <select
            name="status"
            defaultValue={defaults.status ?? 'on_track'}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                       focus:outline-none focus:border-indigo-400 bg-white transition-colors"
          >
            {STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Due date</label>
          <input
            type="date"
            name="due_date"
            defaultValue={defaults.due_date ?? ''}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                       focus:outline-none focus:border-indigo-400 transition-colors"
          />
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
        <div className="flex flex-wrap gap-2 items-center">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full transition-all border-2"
              style={{
                backgroundColor: c,
                borderColor: color === c ? '#111' : 'transparent',
                transform:  color === c ? 'scale(1.2)' : 'scale(1)',
              }}
              aria-label={c}
            />
          ))}
          {/* Custom color picker */}
          <label className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300
                            flex items-center justify-center cursor-pointer hover:border-gray-400
                            transition-colors overflow-hidden" title="Custom color">
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="opacity-0 absolute w-0 h-0"
            />
            <span className="text-gray-400 text-xs">+</span>
          </label>

          {/* Preview */}
          <div className="flex items-center gap-2 ml-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400 font-mono">{color}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {/* Delete button (edit form only) */}
          {projectId && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={`text-sm px-4 py-2.5 rounded-xl font-medium transition-colors
                         ${confirming
                           ? 'bg-red-500 text-white hover:bg-red-600'
                           : 'text-red-500 hover:bg-red-50 border border-red-200'}`}
            >
              {deleting ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete project'}
            </button>
          )}

          <button
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm
                       font-semibold hover:bg-indigo-700 transition-colors"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
