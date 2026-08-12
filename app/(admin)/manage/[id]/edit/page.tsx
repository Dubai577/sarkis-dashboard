import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import ProjectForm from '@/components/projects/ProjectForm'
import { updateProject, deleteProject } from '@/app/actions/projects'

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()
  const { data: project } = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-8">

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/manage" className="hover:text-gray-600 transition-colors">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/manage/${id}`}
                className="hover:text-gray-600 transition-colors truncate max-w-[160px]">
            {project.name}
          </Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">Edit</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h1 className="text-lg font-bold text-gray-900 mb-6">Edit project</h1>
          <ProjectForm
            action={updateProject.bind(null, id)}
            onDelete={deleteProject}
            projectId={id}
            submitLabel="Save changes"
            defaults={{
              name:        project.name,
              description: project.description ?? '',
              status:      project.status,
              due_date:    project.due_date ?? '',
              color:       project.color,
            }}
          />
        </div>

      </div>
    </main>
  )
}