'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const ASSIGNMENT_TYPES = ['HW', 'Exam', 'Lab', 'Project', 'Other']

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((due - today) / (1000 * 60 * 60 * 24))
  return diff
}

function urgencyColor(days) {
  if (days < 0) return 'border-l-4 border-gray-600 opacity-50'
  if (days <= 1) return 'border-l-4 border-red-500'
  if (days <= 3) return 'border-l-4 border-yellow-500'
  if (days <= 7) return 'border-l-4 border-blue-500'
  return 'border-l-4 border-gray-600'
}

function urgencyLabel(days) {
  if (days < 0) return 'Overdue'
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `${days} days left`
}

export default function SweatPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [hideComplete, setHideComplete] = useState(true)
  const [newTask, setNewTask] = useState({
    course: '', title: '', due_date: '',
    assignment_type: 'HW'
  })

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('sweat_tasks')
      .select('*')
      .order('due_date')
    if (!error) setTasks(data)
    setLoading(false)
  }

  async function addTask() {
    if (!newTask.title.trim() || !newTask.course.trim() || !newTask.due_date) return
    const { data, error } = await supabase
      .from('sweat_tasks').insert([newTask]).select()
    if (!error) {
      setTasks([...tasks, ...data].sort((a, b) => new Date(a.due_date) - new Date(b.due_date)))
      setNewTask({ course: '', title: '', due_date: '', assignment_type: 'HW' })
      setShowForm(false)
    }
  }

  async function toggleComplete(id, current) {
    await supabase.from('sweat_tasks').update({ is_complete: !current }).eq('id', id)
    setTasks(tasks.map(t => t.id === id ? { ...t, is_complete: !current } : t))
  }

  async function deleteTask(id) {
    await supabase.from('sweat_tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const filtered = hideComplete ? tasks.filter(t => !t.is_complete) : tasks

  const courses = [...new Set(tasks.map(t => t.course))]

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Sweat</h1>
          <span className="text-gray-500 text-sm">{filtered.length} pending</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setHideComplete(!hideComplete)}
              className="bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-2 text-sm transition"
            >
              {hideComplete ? 'Show completed' : 'Hide completed'}
            </button>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              + New Task
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Course (e.g. ISE 4404)"
                value={newTask.course}
                onChange={e => setNewTask({ ...newTask, course: e.target.value })}
              />
              <select
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                value={newTask.assignment_type}
                onChange={e => setNewTask({ ...newTask, assignment_type: e.target.value })}
              >
                {ASSIGNMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <input
              className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Assignment title"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
            />
            <input
              type="date"
              className="bg-gray-700 rounded-lg px-4 py-2 outline-none w-full"
              value={newTask.due_date}
              onChange={e => setNewTask({ ...newTask, due_date: e.target.value })}
            />
            <div className="flex gap-2">
              <button onClick={addTask} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm transition">
                Save
              </button>
              <button onClick={() => setShowForm(false)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-gray-500">No pending assignments.</p>}
            {filtered.map(task => {
              const days = daysUntil(task.due_date)
              return (
                <div key={task.id} className={`bg-gray-800 rounded-xl p-4 flex items-center gap-4 ${urgencyColor(days)}`}>
                  <input
                    type="checkbox"
                    checked={task.is_complete}
                    onChange={() => toggleComplete(task.id, task.is_complete)}
                    className="accent-blue-500 w-4 h-4 flex-shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${task.is_complete ? 'line-through text-gray-500' : ''}`}>
                        {task.title}
                      </span>
                      <span className="text-xs bg-gray-700 rounded-full px-2 py-0.5">{task.assignment_type}</span>
                    </div>
                    <p className="text-sm text-gray-400">{task.course}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{task.due_date}</p>
                    <p className={`text-xs ${days <= 1 ? 'text-red-400' : days <= 3 ? 'text-yellow-400' : 'text-gray-500'}`}>
                      {urgencyLabel(days)}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-gray-500 hover:text-red-400 transition text-sm"
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
