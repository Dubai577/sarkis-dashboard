'use client'

import Link from 'next/link'

export default function AdminProjectLink({
  projectId,
  projectName,
  projectColor,
}: {
  projectId:    string
  projectName:  string
  projectColor: string
}) {
  return (
    <Link
      href={`/portal/project/${projectId}`}
      className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl
                 p-4 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <span className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: projectColor }} />
      <span className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 flex-1">
        {projectName}
      </span>
      <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium">
        ⭐ Project admin
      </span>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400"
           fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
