import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import ContributorList from './ContributorList'

export const revalidate = 0

export default async function ContributorsPage() {
  const db = createAdminClient()

  const [{ data: contributors }, { data: projects }] = await Promise.all([
    db.from('contributors')
      .select('*')
      .order('name'),
    db.from('projects')
      .select('id, name, color')
      .neq('status', 'completed')
      .order('name'),
  ])

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/projects" className="hover:text-gray-600 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium">Contributors</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contributors</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {contributors?.length ?? 0} servants in your roster
            </p>
          </div>
        </div>

        <ContributorList
          contributors={contributors ?? []}
          projects={projects ?? []}
        />
      </div>
    </main>
  )
}
