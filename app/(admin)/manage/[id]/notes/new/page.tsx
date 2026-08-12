import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNote } from '@/app/actions/projects'

export default async function NewNotePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = createAdminClient()

  const { data: project } = await db
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!project) notFound()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-6 py-8">

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/manage" className="hover:text-gray-600">Projects</Link>
          <span>/</span>
          <Link href={`/manage/${id}`} className="hover:text-gray-600">{project.name}</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">New note</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-lg font-bold text-gray-900 mb-5">Add note</h1>

          <form action={createNote.bind(null, id)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Content <span className="text-red-400">*</span>
              </label>
              <textarea
                name="content"
                required
                rows={5}
                placeholder="Write your note…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                           focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Visibility</label>
              <div className="flex gap-2">
                {[
                  { value: 'admin_only',    label: 'Admin only' },
                  { value: 'contributors',  label: 'Everyone' },
                ].map(opt => (
                  <label key={opt.value}
                         className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      value={opt.value}
                      defaultChecked={opt.value === 'admin_only'}
                      className="accent-indigo-600"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                name="is_pinned"
                value="true"
                className="rounded accent-indigo-600"
              />
              Pin this note
            </label>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm
                           font-semibold hover:bg-indigo-700 transition-colors"
              >
                Save note
              </button>
              <Link
                href={`/manage/${id}`}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
