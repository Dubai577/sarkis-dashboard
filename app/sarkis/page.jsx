'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const PRIORITIES = ['High', 'Medium', 'Low']
const STATUSES = ['Backlog', 'In Progress', 'Done', 'Deferred']

const priorityColor = {
  High: 'text-red-400',
  Medium: 'text-yellow-400',
  Low: 'text-green-400'
}

const statusColor = {
  Backlog: 'bg-gray-700',
  'In Progress': 'bg-blue-900',
  Done: 'bg-green-900',
  Deferred: 'bg-gray-800'
}

export default function SarkisPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('All')
  const [newTask, setNewTask] = useState({
    title: '', category: '', priority: 'Medium',
    status: 'Backlog', planned_date: '', notes: ''
  })

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('sarkis_tasks')
      .select('*')
      .order('sort_order')
    if (!error) setTasks(data)
    setLoading(false)
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    const insert = { ...newTask }
    if (!insert.planned_date) delete insert.planned_date
    const { data, error } = await supabase
      .from('sarkis_tasks').insert([insert]).select()
    if (!error) {
      setTasks([...tasks, ...data])
      setNewTask({ title: '', category: '', priority: 'Medium', status: 'Backlog', planned_date: '', notes: '' })
      setShowForm(false)
    }
  }

  async function updateStatus(id, status) {
    await supabase.from('sarkis_tasks').update({ status }).eq('id', id)
    setTasks(tasks.map(t => t.id === id ? { ...t, status } : t))
  }

  async function deleteTask(id) {
    await supabase.from('sarkis_tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
  }

  const filtered = filterStatus === 'All' ? tasks : tasks.filter(t => t.status === filterStatus)

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Sarkis Tasks</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="ml-auto bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            + New Task
          </button>
        </div>

        {showForm && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6 space-y-3">
            <input
              className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Task title"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                placeholder="Category (e.g. Church, School)"
                value={newTask.category}
                onChange={e => setNewTask({ ...newTask, category: e.target.value })}
              />
              <input
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                placeholder="Notes"
                value={newTask.notes}
                onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
              />
              <select
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                value={newTask.priority}
                onChange={e => setNewTask({ ...newTask, priority: e.target.value })}
              >
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                value={newTask.status}
                onChange={e => setNewTask({ ...newTask, status: e.target.value })}
              >
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <input
                type="date"
                className="bg-gray-700 rounded-lg px-4 py-2 outline-none"
                value={newTask.planned_date}
                onChange={e => setNewTask({ ...newTask, planned_date: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm transition">
                Save Task
              </button>
              <button onClick={() => setShowForm(false)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {['All', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-sm transition ${filterStatus === s ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="space-y-3">
            {filtered.length === 0 && <p className="text-gray-500">No tasks here.</p>}
            {filtered.map(task => (
              <div key={task.id} className={`rounded-xl p-4 flex items-center gap-4 ${statusColor[task.status]}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{task.title}</span>
                    {task.category && (
                      <span className="text-xs bg-gray-600 rounded-full px-2 py-0.5">{task.category}</span>
                    )}
                    <span className={`text-xs font-medium ${priorityColor[task.priority]}`}>{task.priority}</span>
                  </div>
                  {task.notes && <p className="text-sm text-gray-400 mt-1">{task.notes}</p>}
                  {task.planned_date && (
                    <p className="text-xs text-gray-500 mt-1">📅 {task.planned_date}</p>
                  )}
                </div>
                <select
                  className="bg-gray-700 rounded-lg px-2 py-1 text-sm outline-none"
                  value={task.status}
                  onChange={e => updateStatus(task.id, e.target.value)}
                >
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="text-gray-500 hover:text-red-400 transition text-sm"
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}