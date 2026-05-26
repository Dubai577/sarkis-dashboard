import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTask } from '@/app/actions/tasks'

export default async function NewTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data: project } = await db.from('projects').select('id,name').eq('id', id).single()
  if (!project) notFound()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/projects" className="hover:text-gray-600">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-gray-600">{project.name}</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">New task</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-lg font-bold text-gray-900 mb-6">Create task</h1>

          <form action={createTask.bind(null, id)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Task name <span className="text-red-400">*</span>
              </label>
              <input
                name="title"
                required
                placeholder="e.g. Write chapter outlines"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                           focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Description
              </label>
              <textarea
                name="description"
                rows={3}
                placeholder="What needs to be done?"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                           focus:outline-none focus:border-indigo-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Due date</label>
              <input
                type="date"
                name="due_date"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                           focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              <Link href={`/projects/${id}`} className="text-sm text-gray-400 hover:text-gray-600">
                Cancel
              </Link>
              <button
                type="submit"
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm
                           font-semibold hover:bg-indigo-700 transition-colors"
              >
                Create task
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
