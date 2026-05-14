import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-2">Sarkis Dashboard</h1>
      <p className="text-gray-400 mb-8">Personal command center</p>

      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <Link href="/todos" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 transition">
          <div className="text-2xl mb-2">✅</div>
          <div className="font-semibold">Weekly Todos</div>
          <div className="text-sm text-gray-400">Day-by-day task list</div>
        </Link>

        <Link href="/sarkis" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 transition">
          <div className="text-2xl mb-2">📋</div>
          <div className="font-semibold">Sarkis Tasks</div>
          <div className="text-sm text-gray-400">Backlog & priorities</div>
        </Link>

        <Link href="/sweat" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 transition">
          <div className="text-2xl mb-2">📚</div>
          <div className="font-semibold">Sweat</div>
          <div className="text-sm text-gray-400">Academic deadlines</div>
        </Link>

        <Link href="/notes" className="bg-gray-800 hover:bg-gray-700 rounded-xl p-6 transition">
          <div className="text-2xl mb-2">📝</div>
          <div className="font-semibold">Notes</div>
          <div className="text-sm text-gray-400">Freeform notes</div>
        </Link>
      </div>
    </main>
  )
}