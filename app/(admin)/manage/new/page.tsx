import Link from 'next/link'
import ProjectForm from '@/components/projects/ProjectForm'
import { createProject } from '@/app/actions/projects'

export default function NewProjectPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-8">

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/manage" className="hover:text-gray-600 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">New project</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-lg font-bold text-gray-900 mb-6">Create project</h1>
          <ProjectForm action={createProject} submitLabel="Create project" />
        </div>

      </div>
    </main>
  )
}
