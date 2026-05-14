import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-1">Sarkis</h1>
          <p className="text-gray-400 text-lg">Personal command center</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/todos" className="bg-gray-800 active:bg-gray-700 rounded-2xl p-5 transition">
            <div className="text-3xl mb-3">✅</div>
            <div className="font-semibold text-lg">Todos</div>
            <div className="text-sm text-gray-400 mt-1">Weekly tasks</div>
          </Link>

          <Link href="/sarkis" className="bg-gray-800 active:bg-gray-700 rounded-2xl p-5 transition">
            <div className="text-3xl mb-3">📋</div>
            <div className="font-semibold text-lg">Sarkis</div>
            <div className="text-sm text-gray-400 mt-1">Task backlog</div>
          </Link>

          <Link href="/sweat" className="bg-gray-800 active:bg-gray-700 rounded-2xl p-5 transition">
            <div className="text-3xl mb-3">📚</div>
            <div className="font-semibold text-lg">Sweat</div>
            <div className="text-sm text-gray-400 mt-1">School deadlines</div>
          </Link>

          <Link href="/notes" className="bg-gray-800 active:bg-gray-700 rounded-2xl p-5 transition">
            <div className="text-3xl mb-3">📝</div>
            <div className="font-semibold text-lg">Notes</div>
            <div className="text-sm text-gray-400 mt-1">Quick notes</div>
          </Link>
        </div>
      </div>
    </main>
  )
}