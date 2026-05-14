'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const PRIORITIES = ['Urgent', 'Soon', 'Whenever', 'N/A']
const STATUSES = ["Haven't Started", 'Working on it', 'Done']

const priorityDot = {
  Urgent: 'bg-red-500',
  Soon: 'bg-yellow-400',
  Whenever: 'bg-green-500',
  'N/A': 'bg-gray-500'
}

const priorityOrder = { Urgent: 0, Soon: 1, Whenever: 2, 'N/A': 3 }

export default function SarkisPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [sortBy, setSortBy] = useState('category')
  const [showForm, setShowForm] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [newTask, setNewTask] = useState({
    title: '', category: '', subcategory: '', priority: 'Soon',
    status: "Haven't Started", planned_date: '', due_date: '', notes: ''
  })

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data, error } = await supabase
      .from('sarkis_tasks')
      .select('*')
    if (!error) setTasks(data)
    setLoading(false)
  }

  async function addTask() {
    if (!newTask.title.trim()) return
    const insert = { ...newTask }
    if (!insert.planned_date) delete insert.planned_date
    if (!insert.due_date) delete insert.due_date
    const { data, error } = await supabase
      .from('sarkis_tasks').insert([insert]).select()
    if (!error) {
      setTasks([...tasks, ...data])
      setNewTask({ title: '', category: '', subcategory: '', priority: 'Soon', status: "Haven't Started", planned_date: '', due_date: '', notes: '' })
      setShowForm(false)
    }
  }

  async function saveEdit() {
    if (!editTask) return
    const update = { ...editTask }
    if (!update.planned_date) update.planned_date = null
    if (!update.due_date) update.due_date = null
    const { error } = await supabase
      .from('sarkis_tasks').update(update).eq('id', editTask.id)
    if (!error) {
      setTasks(tasks.map(t => t.id === editTask.id ? editTask : t))
      setEditTask(null)
    }
  }

  async function deleteTask(id) {
    await supabase.from('sarkis_tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
    setEditTask(null)
  }

  const filtered = tasks
    .filter(t => filterStatus === 'All' || t.status === filterStatus)
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.notes && t.notes.toLowerCase().includes(search.toLowerCase())))

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'category': return (a.category || '').localeCompare(b.category || '')
      case 'priority': return priorityOrder[a.priority] - priorityOrder[b.priority]
      case 'status': return (a.status || '').localeCompare(b.status || '')
      case 'title': return a.title.localeCompare(b.title)
      case 'due_date': {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      }
      case 'planned_date': {
        if (!a.planned_date && !b.planned_date) return 0
        if (!a.planned_date) return 1
        if (!b.planned_date) return -1
        return new Date(a.planned_date) - new Date(b.planned_date)
      }
      case 'newest': return new Date(b.created_at) - new Date(a.created_at)
      case 'oldest': return new Date(a.created_at) - new Date(b.created_at)
      default: return 0
    }
  })

  const grouped = sortBy === 'category'
    ? sorted.reduce((acc, task) => {
        const cat = task.category || 'Uncategorized'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(task)
        return acc
      }, {})
    : sortBy === 'priority'
    ? sorted.reduce((acc, task) => {
        const p = task.priority || 'N/A'
        if (!acc[p]) acc[p] = []
        acc[p].push(task)
        return acc
      }, {})
    : sortBy === 'status'
    ? sorted.reduce((acc, task) => {
        const s = task.status || 'Unknown'
        if (!acc[s]) acc[s] = []
        acc[s].push(task)
        return acc
      }, {})
    : { 'All Tasks': sorted }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Sarkis Tasks</h1>
          <span className="text-gray-500 text-sm">{tasks.filter(t => t.status !== 'Done').length} active</span>
          <button
            onClick={() => setShowForm(!showForm)}
            className="ml-auto bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm font-medium transition"
          >+ New Task</button>
        </div>

        <input
          className="w-full bg-gray-800 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500 text-sm mb-4"
          placeholder="Search tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500 self-center">Status:</span>
          {['All', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-sm transition ${filterStatus === s ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >{s}</button>
          ))}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap items-center">
          <span className="text-xs text-gray-500">Sort:</span>
          {[
            { value: 'category', label: 'Category' },
            { value: 'priority', label: 'Priority' },
            { value: 'status', label: 'Status' },
            { value: 'title', label: 'A–Z' },
            { value: 'due_date', label: 'Due Date' },
            { value: 'planned_date', label: 'Planned' },
            { value: 'newest', label: 'Newest' },
            { value: 'oldest', label: 'Oldest' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-3 py-1 rounded-full text-xs transition ${sortBy === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
            >{opt.label}</button>
          ))}
        </div>

        {showForm && (
          <div className="bg-gray-800 rounded-xl p-6 mb-6 space-y-3">
            <input
              className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Task title"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addTask()}
            />
            <div className="grid grid-cols-2 gap-3">
              <input className="bg-gray-700 rounded-lg px-4 py-2 outline-none" placeholder="Category" value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value })} />
              <input className="bg-gray-700 rounded-lg px-4 py-2 outline-none" placeholder="Subcategory" value={newTask.subcategory} onChange={e => setNewTask({ ...newTask, subcategory: e.target.value })} />
              <select className="bg-gray-700 rounded-lg px-4 py-2 outline-none" value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select className="bg-gray-700 rounded-lg px-4 py-2 outline-none" value={newTask.status} onChange={e => setNewTask({ ...newTask, status: e.target.value })}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Planned Date</label>
                <input type="date" className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none" value={newTask.planned_date} onChange={e => setNewTask({ ...newTask, planned_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
                <input type="date" className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none" value={newTask.due_date} onChange={e => setNewTask({ ...newTask, due_date: e.target.value })} />
              </div>
            </div>
            <textarea className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none resize-none" rows={2} placeholder="Notes" value={newTask.notes} onChange={e => setNewTask({ ...newTask, notes: e.target.value })} />
            <div className="flex gap-2">
              <button onClick={addTask} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm transition">Save</button>
              <button onClick={() => setShowForm(false)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm transition">Cancel</button>
            </div>
          </div>
        )}

        {editTask && (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={() => setEditTask(null)}>
            <div className="bg-gray-900 rounded-t-2xl p-6 w-full max-w-lg space-y-3 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-lg">Edit Task</h2>
              <input className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none" value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <input className="bg-gray-700 rounded-lg px-4 py-2 outline-none" placeholder="Category" value={editTask.category || ''} onChange={e => setEditTask({ ...editTask, category: e.target.value })} />
                <input className="bg-gray-700 rounded-lg px-4 py-2 outline-none" placeholder="Subcategory" value={editTask.subcategory || ''} onChange={e => setEditTask({ ...editTask, subcategory: e.target.value })} />
                <select className="bg-gray-700 rounded-lg px-4 py-2 outline-none" value={editTask.priority} onChange={e => setEditTask({ ...editTask, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
                <select className="bg-gray-700 rounded-lg px-4 py-2 outline-none" value={editTask.status} onChange={e => setEditTask({ ...editTask, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Planned Date</label>
                  <input type="date" className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none" value={editTask.planned_date || ''} onChange={e => setEditTask({ ...editTask, planned_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Due Date</label>
                  <input type="date" className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none" value={editTask.due_date || ''} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} />
                </div>
              </div>
              <textarea className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none resize-none" rows={2} placeholder="Notes" value={editTask.notes || ''} onChange={e => setEditTask({ ...editTask, notes: e.target.value })} />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm transition flex-1">Save Changes</button>
                <button onClick={() => deleteTask(editTask.id)} className="bg-red-900 hover:bg-red-800 rounded-lg px-4 py-2 text-sm transition">Delete</button>
                <button onClick={() => setEditTask(null)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm transition">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <p className="text-gray-400">Loading...</p> : (
          <div className="space-y-6">
            {Object.keys(grouped).map(category => (
              <div key={category}>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2 px-1">
                  {category} <span className="text-gray-600">({grouped[category].length})</span>
                </h2>
                <div className="space-y-1">
                  {grouped[category].map(task => (
                    <div
                      key={task.id}
                      onClick={() => setEditTask(task)}
                      className="bg-gray-800 hover:bg-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 cursor-pointer transition"
                    >
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDot[task.priority]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${task.status === 'Done' ? 'line-through text-gray-500' : ''}`}>
                            {task.title}
                          </span>
                          {task.subcategory && (
                            <span className="text-xs bg-gray-700 rounded-full px-2 py-0.5 text-gray-300">{task.subcategory}</span>
                          )}
                        </div>
                        {task.notes && <p className="text-xs text-gray-500 mt-0.5 truncate">{task.notes}</p>}
                        <div className="flex gap-3 mt-1">
                          {task.planned_date && <span className="text-xs text-gray-500">📅 {task.planned_date}</span>}
                          {task.due_date && <span className="text-xs text-red-400">⚠ Due {task.due_date}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                        task.status === 'Done' ? 'bg-green-900 text-green-300' :
                        task.status === 'Working on it' ? 'bg-blue-900 text-blue-300' :
                        'bg-gray-700 text-gray-400'
                      }`}>{task.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}