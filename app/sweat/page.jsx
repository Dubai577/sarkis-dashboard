'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const ASSIGNMENT_TYPES = ['HW', 'Exam', 'Lab', 'Project', 'Other']

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  return Math.round((due - today) / (1000 * 60 * 60 * 24))
}

function urgencyStyle(days) {
  if (days < 0) return 'border-l-4 border-gray-600 opacity-50'
  if (days <= 1) return 'border-l-4 border-red-500'
  if (days <= 3) return 'border-l-4 border-yellow-500'
  if (days <= 7) return 'border-l-4 border-blue-500'
  return 'border-l-4 border-gray-600'
}

function urgencyLabel(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `${days}d left`
}

function urgencyColor(days) {
  if (days < 0) return 'text-gray-500'
  if (days <= 1) return 'text-red-400'
  if (days <= 3) return 'text-yellow-400'
  return 'text-gray-400'
}

export default function SweatPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [hideComplete, setHideComplete] = useState(true)
  const [editTask, setEditTask] = useState(null)
  const [newTask, setNewTask] = useState({
    course: '', title: '', my_due_date: '', actual_due_date: '',
    assignment_type: 'HW', start_time: '', end_time: ''
  })

  useEffect(() => { fetchTasks() }, [])

  async function fetchTasks() {
    const { data } = await supabase
      .from('sweat_tasks')
      .select('*')
      .order('actual_due_date', { ascending: true, nullsFirst: false })
    if (data) setTasks(data)
    setLoading(false)
  }

  async function addTask() {
    if (!newTask.title.trim() || !newTask.course.trim()) return
    const insert = { ...newTask }
    if (!insert.my_due_date) delete insert.my_due_date
    if (!insert.actual_due_date) delete insert.actual_due_date
    if (!insert.start_time) delete insert.start_time
    if (!insert.end_time) delete insert.end_time
    const { data } = await supabase.from('sweat_tasks').insert([insert]).select()
    if (data) {
      setTasks([...tasks, ...data].sort((a, b) => new Date(a.actual_due_date || a.my_due_date) - new Date(b.actual_due_date || b.my_due_date)))
      setNewTask({ course: '', title: '', my_due_date: '', actual_due_date: '', assignment_type: 'HW', start_time: '', end_time: '' })
      setShowForm(false)
    }
  }

  async function saveEdit() {
    if (!editTask) return
    await supabase.from('sweat_tasks').update(editTask).eq('id', editTask.id)
    setTasks(tasks.map(t => t.id === editTask.id ? editTask : t))
    setEditTask(null)
  }

  async function toggleComplete(id, current) {
    await supabase.from('sweat_tasks').update({ is_complete: !current }).eq('id', id)
    setTasks(tasks.map(t => t.id === id ? { ...t, is_complete: !current } : t))
  }

  async function deleteTask(id) {
    await supabase.from('sweat_tasks').delete().eq('id', id)
    setTasks(tasks.filter(t => t.id !== id))
    setEditTask(null)
  }

  const filtered = hideComplete ? tasks.filter(t => !t.is_complete) : tasks

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 text-2xl">←</Link>
          <h1 className="text-2xl font-bold">Sweat</h1>
          <span className="text-gray-500">{filtered.length} pending</span>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setHideComplete(!hideComplete)} className="text-sm text-gray-400 py-1 px-2">
              {hideComplete ? 'Show all' : 'Hide done'}
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full bg-blue-600 active:bg-blue-700 rounded-2xl py-3 font-semibold mb-4 transition"
        >+ New Assignment</button>

        {showForm && (
          <div className="bg-gray-800 rounded-2xl p-4 mb-4 space-y-3">
            <input className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" placeholder="Course (e.g. ISE 4404)" value={newTask.course} onChange={e => setNewTask({ ...newTask, course: e.target.value })} />
            <input className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" placeholder="Assignment title" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} />
            <select className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" value={newTask.assignment_type} onChange={e => setNewTask({ ...newTask, assignment_type: e.target.value })}>
              {ASSIGNMENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">My Due Date</label>
                <input type="date" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.my_due_date} onChange={e => setNewTask({ ...newTask, my_due_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Actual Due Date</label>
                <input type="date" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.actual_due_date} onChange={e => setNewTask({ ...newTask, actual_due_date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Start Time</label>
                <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.start_time} onChange={e => setNewTask({ ...newTask, start_time: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">End Time</label>
                <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.end_time} onChange={e => setNewTask({ ...newTask, end_time: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addTask} className="flex-1 bg-blue-600 rounded-xl py-3 font-medium">Save</button>
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-700 rounded-xl py-3">Cancel</button>
            </div>
          </div>
        )}

        {editTask && (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={() => setEditTask(null)}>
            <div className="bg-gray-900 rounded-t-3xl p-6 w-full max-w-lg space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-4" />
              <h2 className="font-bold text-lg">Edit Assignment</h2>
              <input className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" value={editTask.course} onChange={e => setEditTask({ ...editTask, course: e.target.value })} placeholder="Course" />
              <input className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" value={editTask.title} onChange={e => setEditTask({ ...editTask, title: e.target.value })} placeholder="Title" />
              <select className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" value={editTask.assignment_type} onChange={e => setEditTask({ ...editTask, assignment_type: e.target.value })}>
                {ASSIGNMENT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">My Due Date</label>
                  <input type="date" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTask.my_due_date || ''} onChange={e => setEditTask({ ...editTask, my_due_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Actual Due Date</label>
                  <input type="date" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTask.actual_due_date || ''} onChange={e => setEditTask({ ...editTask, actual_due_date: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Start Time</label>
                  <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTask.start_time || ''} onChange={e => setEditTask({ ...editTask, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">End Time</label>
                  <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTask.end_time || ''} onChange={e => setEditTask({ ...editTask, end_time: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveEdit} className="flex-1 bg-blue-600 rounded-xl py-3 font-medium">Save</button>
                <button onClick={() => deleteTask(editTask.id)} className="bg-red-900 rounded-xl py-3 px-4">Delete</button>
                <button onClick={() => setEditTask(null)} className="bg-gray-700 rounded-xl py-3 px-4">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <p className="text-gray-400">Loading...</p> : (
          <div className="space-y-3">
            {filtered.length === 0 && <p className="text-gray-500 text-center py-8">No pending assignments.</p>}
            {filtered.map(task => {
              const days = task.actual_due_date ? daysUntil(task.actual_due_date) : task.my_due_date ? daysUntil(task.my_due_date) : null
              return (
                <div key={task.id} onClick={() => setEditTask(task)} className={`bg-gray-800 rounded-2xl p-4 cursor-pointer active:bg-gray-700 ${days !== null ? urgencyStyle(days) : ''}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={task.is_complete}
                      onChange={e => { e.stopPropagation(); toggleComplete(task.id, task.is_complete) }}
                      className="accent-blue-500 w-5 h-5 mt-0.5 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium text-base ${task.is_complete ? 'line-through text-gray-500' : ''}`}>{task.title}</span>
                        <span className="text-xs bg-gray-700 rounded-full px-2 py-0.5">{task.assignment_type}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{task.course}</p>
                      <div className="flex gap-3 mt-2 flex-wrap">
                        {task.my_due_date && <span className="text-xs text-blue-400">My due: {task.my_due_date}</span>}
                        {task.actual_due_date && <span className="text-xs text-gray-400">Actual: {task.actual_due_date}</span>}
                        {task.start_time && <span className="text-xs text-gray-500">@{task.start_time}{task.end_time ? '-' + task.end_time : ''}</span>}
                        {days !== null && <span className={`text-xs font-medium ${urgencyColor(days)}`}>{urgencyLabel(days)}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}