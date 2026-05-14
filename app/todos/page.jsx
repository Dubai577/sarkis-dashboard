'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const ROUTINES = [
  { name: 'Intro to Agbeya', days: 'daily' },
  { name: 'Coptic Reader Liturgy', days: 'daily' },
  { name: 'Mesalamine', days: 'daily' },
  { name: 'Omeprazole', days: 'daily' },
  { name: 'End of Agbeya', days: 'daily' },
  { name: 'Sermon or Bible Study', days: 'alternating' },
  { name: 'Dupixent', days: 'wednesday' },
]

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

function getDayDate(weekStart, dayIndex) {
  const d = new Date(weekStart + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function getToday() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[new Date().getDay()]
}

function isRoutineApplicable(routine, dayIndex) {
  if (routine.days === 'daily') return true
  if (routine.days === 'wednesday') return dayIndex === 2
  if (routine.days === 'alternating') return dayIndex % 2 === 0
  return true
}

export default function TodosPage() {
  const [todos, setTodos] = useState([])
  const [routineChecks, setRoutineChecks] = useState({})
  const [newTask, setNewTask] = useState({ title: '', day_of_week: getToday(), category: '', time_label: '' })
  const [loading, setLoading] = useState(true)
  const [showRoutines, setShowRoutines] = useState(true)
  const [showOverdue, setShowOverdue] = useState(true)
  const [viewMode, setViewMode] = useState('week')
  const [selectedDay, setSelectedDay] = useState(getToday())
  const [editTodo, setEditTodo] = useState(null)

  const weekStart = getWeekStart()
  const today = getToday()

  useEffect(() => {
    fetchTodos()
    loadRoutineChecks()
  }, [])

  async function fetchTodos() {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('week_start', weekStart)
      .order('sort_order')
    if (!error) setTodos(data)
    setLoading(false)
  }

  function loadRoutineChecks() {
    const key = `routines_${weekStart}`
    const saved = localStorage.getItem(key)
    if (saved) setRoutineChecks(JSON.parse(saved))
  }

  function toggleRoutine(day, routineName) {
    const key = `routines_${weekStart}`
    const k = `${day}_${routineName}`
    const updated = { ...routineChecks, [k]: !routineChecks[k] }
    setRoutineChecks(updated)
    localStorage.setItem(key, JSON.stringify(updated))
  }

  async function addTodo() {
    if (!newTask.title.trim()) return
    const insert = { ...newTask, week_start: weekStart, sort_order: todos.length }
    if (!insert.category) delete insert.category
    if (!insert.time_label) delete insert.time_label
    const { data, error } = await supabase.from('todos').insert([insert]).select()
    if (!error) {
      setTodos([...todos, ...data])
      setNewTask({ title: '', day_of_week: newTask.day_of_week, category: '', time_label: '' })
    }
  }

  async function toggleTodo(id, current) {
    await supabase.from('todos').update({
      is_complete: !current,
      completed_at: !current ? new Date().toISOString() : null
    }).eq('id', id)
    setTodos(todos.map(t => t.id === id ? { ...t, is_complete: !current } : t))
  }

  async function saveEdit() {
    if (!editTodo) return
    const { error } = await supabase.from('todos').update({
      title: editTodo.title,
      category: editTodo.category || null,
      time_label: editTodo.time_label || null,
      day_of_week: editTodo.day_of_week,
    }).eq('id', editTodo.id)
    if (!error) {
      setTodos(todos.map(t => t.id === editTodo.id ? { ...t, ...editTodo } : t))
      setEditTodo(null)
    }
  }

  async function deleteTodo(id) {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(todos.filter(t => t.id !== id))
    setEditTodo(null)
  }

  async function moveToDay(id, day) {
    await supabase.from('todos').update({ day_of_week: day }).eq('id', id)
    setTodos(todos.map(t => t.id === id ? { ...t, day_of_week: day } : t))
  }

  const todosByDay = DAYS.reduce((acc, day) => {
    acc[day] = todos.filter(t => t.day_of_week === day)
    return acc
  }, {})

  const overdueTodos = todos.filter(t => {
    const dayIndex = DAYS.indexOf(t.day_of_week)
    const todayIndex = DAYS.indexOf(today)
    return !t.is_complete && dayIndex < todayIndex
  })

  const daysToRender = viewMode === 'day' ? [selectedDay] : DAYS

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Weekly Todos</h1>
          <span className="text-gray-500 text-sm">Week of {weekStart}</span>
          {overdueTodos.length > 0 && (
            <span className="bg-red-900 text-red-300 text-xs px-2 py-1 rounded-full">{overdueTodos.length} overdue</span>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={() => setViewMode('week')} className={`px-3 py-1 rounded-lg text-sm transition ${viewMode === 'week' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Week</button>
            <button onClick={() => setViewMode('day')} className={`px-3 py-1 rounded-lg text-sm transition ${viewMode === 'day' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}`}>Day</button>
          </div>
        </div>

        {/* Day selector (day view only) */}
        {viewMode === 'day' && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {DAYS.map((day, i) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${selectedDay === day ? 'bg-blue-600' : day === today ? 'bg-gray-700 ring-1 ring-blue-500' : 'bg-gray-800 hover:bg-gray-700'}`}
              >
                {day.slice(0, 3)} <span className="text-xs opacity-70">{getDayDate(weekStart, i)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Overdue banner */}
        {overdueTodos.length > 0 && (
          <div className="bg-red-950 border border-red-800 rounded-xl mb-6 overflow-hidden">
            <button
              onClick={() => setShowOverdue(!showOverdue)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-red-300 text-sm font-medium">⚠ {overdueTodos.length} overdue task{overdueTodos.length > 1 ? 's' : ''} from earlier this week</span>
              <span className="text-red-400 text-xs">{showOverdue ? '▼' : '▶'}</span>
            </button>
            {showOverdue && (
              <div className="px-4 pb-4 space-y-2">
                {overdueTodos.map(t => (
                  <div key={t.id} className="bg-red-900/30 rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={t.is_complete}
                        onChange={() => toggleTodo(t.id, t.is_complete)}
                        className="accent-red-500 mt-0.5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-200">{t.title}</span>
                        {t.category && <span className="block text-xs text-gray-500">[{t.category}]</span>}
                        {t.time_label && <span className="block text-xs text-blue-400">@{t.time_label}</span>}
                        <span className="text-xs text-red-400">{t.day_of_week}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button
                        onClick={() => moveToDay(t.id, today)}
                        className="text-xs bg-blue-700 hover:bg-blue-600 px-2 py-1 rounded transition"
                      >→ Today</button>
                      {DAYS.filter(d => d !== t.day_of_week).map(d => (
                        <button
                          key={d}
                          onClick={() => moveToDay(t.id, d)}
                          className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition"
                        >{d.slice(0, 3)}</button>
                      ))}
                      <button
                        onClick={() => setEditTodo(t)}
                        className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition ml-auto"
                      >✏ Edit</button>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        className="text-xs bg-red-900 hover:bg-red-800 px-2 py-1 rounded transition"
                      >🗑 Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        

        {/* Add task */}
        <div className="bg-gray-800 rounded-xl p-4 mb-6 space-y-3">
          <div className="flex gap-2">
            <input
              className="bg-gray-700 rounded-lg px-4 py-2 flex-1 outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="New task..."
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
            />
            <select
              className="bg-gray-700 rounded-lg px-3 py-2 outline-none"
              value={newTask.day_of_week}
              onChange={e => setNewTask({ ...newTask, day_of_week: e.target.value })}
            >
              {DAYS.map(d => <option key={d}>{d}</option>)}
            </select>
            <button onClick={addTodo} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 font-medium transition">Add</button>
          </div>
          <div className="flex gap-2">
            <input
              className="bg-gray-700 rounded-lg px-4 py-2 flex-1 outline-none text-sm"
              placeholder="Category (optional)"
              value={newTask.category}
              onChange={e => setNewTask({ ...newTask, category: e.target.value })}
            />
            <input
              className="bg-gray-700 rounded-lg px-4 py-2 flex-1 outline-none text-sm"
              placeholder="Time e.g. 14:00-15:00 (optional)"
              value={newTask.time_label}
              onChange={e => setNewTask({ ...newTask, time_label: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowRoutines(!showRoutines)} className="text-xs text-gray-500 hover:text-gray-300 transition">
            {showRoutines ? '▼ Hide Routines' : '▶ Show Routines'}
          </button>
          <span className="text-xs text-gray-600">{todos.filter(t => t.is_complete).length}/{todos.length} done</span>
        </div>

        {/* Edit modal */}
        {editTodo && (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={() => setEditTodo(null)}>
            <div className="bg-gray-900 rounded-t-2xl p-6 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
              <h2 className="font-semibold text-lg">Edit Task</h2>
              <input
                className="w-full bg-gray-700 rounded-lg px-4 py-2 outline-none"
                value={editTodo.title}
                onChange={e => setEditTodo({ ...editTodo, title: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="bg-gray-700 rounded-lg px-4 py-2 outline-none text-sm"
                  placeholder="Category"
                  value={editTodo.category || ''}
                  onChange={e => setEditTodo({ ...editTodo, category: e.target.value })}
                />
                <input
                  className="bg-gray-700 rounded-lg px-4 py-2 outline-none text-sm"
                  placeholder="Time e.g. 14:00-15:00"
                  value={editTodo.time_label || ''}
                  onChange={e => setEditTodo({ ...editTodo, time_label: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Move to day</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button
                      key={d}
                      onClick={() => setEditTodo({ ...editTodo, day_of_week: d })}
                      className={`px-2 py-1 rounded text-xs transition ${editTodo.day_of_week === d ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >{d.slice(0, 3)}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 text-sm transition flex-1">Save</button>
                <button onClick={() => deleteTodo(editTodo.id)} className="bg-red-900 hover:bg-red-800 rounded-lg px-4 py-2 text-sm transition">Delete</button>
                <button onClick={() => setEditTodo(null)} className="bg-gray-700 hover:bg-gray-600 rounded-lg px-4 py-2 text-sm transition">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <p className="text-gray-400">Loading...</p> : (
          <div className={viewMode === 'week' ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3' : 'max-w-lg'}>
            {daysToRender.map((day, idx) => {
              const dayIndex = DAYS.indexOf(day)
              const isToday = day === today
              const dateLabel = getDayDate(weekStart, dayIndex)
              return (
                <div key={day} className={`rounded-xl p-3 ${isToday ? 'bg-gray-700 ring-1 ring-blue-500' : 'bg-gray-800'}`}>
                  <h2 className={`font-semibold text-sm mb-2 flex items-center justify-between ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                    <span>{day.slice(0, 3)} <span className="text-xs font-normal opacity-60">{dateLabel}</span></span>
                    {isToday && <span className="text-xs bg-blue-600 px-1.5 py-0.5 rounded">Today</span>}
                  </h2>

                  {showRoutines && (
                    <div className="mb-3 space-y-1 border-b border-gray-600 pb-2">
                      {ROUTINES.map(routine => {
                        const applicable = isRoutineApplicable(routine, dayIndex)
                        const checked = routineChecks[`${day}_${routine.name}`]
                        return (
                          <div key={routine.name} className={`flex items-center gap-1.5 ${!applicable ? 'opacity-20' : ''}`}>
                            <input
                              type="checkbox"
                              checked={!!checked}
                              onChange={() => applicable && toggleRoutine(day, routine.name)}
                              disabled={!applicable}
                              className="accent-purple-500 w-3 h-3 flex-shrink-0"
                            />
                            <span className={`text-xs truncate ${checked ? 'line-through text-gray-500' : 'text-gray-400'}`}>
                              {routine.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {todosByDay[day].length === 0 && <p className="text-gray-600 text-xs">No tasks</p>}
                    {todosByDay[day].map(todo => (
                      <div key={todo.id} className="flex items-start gap-1.5 group">
                        <input
                          type="checkbox"
                          checked={todo.is_complete}
                          onChange={() => toggleTodo(todo.id, todo.is_complete)}
                          className="accent-blue-500 mt-0.5 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setEditTodo(todo)}>
                          <span className={`text-xs ${todo.is_complete ? 'line-through text-gray-500' : ''}`}>
                            {todo.title}
                          </span>
                          {todo.category && <span className="block text-xs text-gray-500 truncate">[{todo.category}]</span>}
                          {todo.time_label && <span className="block text-xs text-blue-400">@{todo.time_label}</span>}
                        </div>
                        <button
                          onClick={() => deleteTodo(todo.id)}
                          className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs flex-shrink-0"
                        >✕</button>
                      </div>
                    ))}
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