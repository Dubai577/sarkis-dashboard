'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  DAY_NAMES as DAYS,
  currentWeekStart,
  dateForDay,
  dayName,
  shortLabel,
  today as todayIso,
} from '@/lib/dates'

const ROUTINES = [
  { name: 'Intro to Agbeya', days: 'daily' },
  { name: 'Coptic Reader Liturgy', days: 'daily' },
  { name: 'Mesalamine', days: 'daily' },
  { name: 'Omeprazole', days: 'daily' },
  { name: 'End of Agbeya', days: 'daily' },
  { name: 'Sermon or Bible Study', days: 'alternating' },
  { name: 'Dupixent', days: 'wednesday' },
]

function isRoutineApplicable(routine, dayIndex) {
  if (routine.days === 'daily') return true
  if (routine.days === 'wednesday') return dayIndex === 2
  if (routine.days === 'alternating') return dayIndex % 2 === 0
  return true
}

/** Every write goes through here so a failed request can never look like a success. */
async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401) {
    window.location.href = '/login?next=/todos'
    throw new Error('Session expired.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed.')
  return data
}

function SortableTask({ todo, onToggle, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 group bg-gray-900 rounded-xl px-3 py-2">
      <button {...attributes} {...listeners} className="text-gray-600 mt-1 touch-none text-lg cursor-grab active:cursor-grabbing flex-shrink-0">⠿</button>
      <input
        type="checkbox"
        checked={todo.is_complete}
        onChange={() => onToggle(todo.id, todo.is_complete)}
        className="accent-blue-500 mt-1 flex-shrink-0 w-4 h-4"
      />
      <div className="flex-1 min-w-0" onClick={() => onEdit(todo)}>
        <span className={`text-sm ${todo.is_complete ? 'line-through text-gray-500' : ''}`}>
          {todo.title}
        </span>
        {todo.category && <span className="block text-xs text-gray-500">[{todo.category}]</span>}
        {(todo.start_time || todo.time_label) && (
          <span className="block text-xs text-blue-400">
            @{todo.start_time || todo.time_label}{todo.end_time ? '-' + todo.end_time : ''}
          </span>
        )}
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs flex-shrink-0 mt-1"
      >✕</button>
    </div>
  )
}

export default function TodosPage() {
  const [todos, setTodos] = useState([])
  const [overdueTodos, setOverdueTodos] = useState([])
  const [routineChecks, setRoutineChecks] = useState({})
  const [newTask, setNewTask] = useState({ title: '', day_of_week: dayName(todayIso()), category: '', start_time: '', end_time: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showRoutines, setShowRoutines] = useState(true)
  const [showOverdue, setShowOverdue] = useState(true)
  const [viewMode, setViewMode] = useState('day')
  const [selectedDay, setSelectedDay] = useState(dayName(todayIso()))
  const [editTodo, setEditTodo] = useState(null)

  const weekStart = currentWeekStart()
  const today = dayName(todayIso())

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  useEffect(() => {
    fetchTodos()
    loadRoutineChecks()
  }, [])

  async function fetchTodos() {
    try {
      const { todos: week, overdue } = await api(`/api/todos?week=${weekStart}`)
      setTodos(week)
      setOverdueTodos(overdue)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Still browser-local. Moving routines into the database is Release 2.
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
    const { day_of_week, ...rest } = newTask
    const payload = {
      ...rest,
      // The server derives week_start and day_of_week from this.
      task_date: dateForDay(weekStart, day_of_week),
      sort_order: todos.filter(t => t.day_of_week === day_of_week).length,
    }
    try {
      const { todo } = await api('/api/todos', { method: 'POST', body: JSON.stringify(payload) })
      setTodos([...todos, todo])
      setNewTask({ title: '', day_of_week: newTask.day_of_week, category: '', start_time: '', end_time: '' })
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function toggleTodo(id, current) {
    try {
      const { todo } = await api(`/api/todos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_complete: !current }),
      })
      setTodos(todos.map(t => t.id === id ? todo : t))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveEdit() {
    if (!editTodo) return
    try {
      const { todo } = await api(`/api/todos/${editTodo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editTodo.title,
          category: editTodo.category || '',
          start_time: editTodo.start_time || '',
          end_time: editTodo.end_time || '',
          task_date: dateForDay(weekStart, editTodo.day_of_week),
        }),
      })
      setTodos(todos.map(t => t.id === todo.id ? todo : t))
      setOverdueTodos(overdueTodos.map(t => t.id === todo.id ? todo : t))
      setEditTodo(null)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteTodo(id) {
    try {
      await api(`/api/todos/${id}`, { method: 'DELETE' })
      setTodos(todos.filter(t => t.id !== id))
      setOverdueTodos(overdueTodos.filter(t => t.id !== id))
      setEditTodo(null)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function moveToDay(id, day) {
    try {
      const { todo } = await api(`/api/todos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ task_date: dateForDay(weekStart, day) }),
      })
      setTodos(todos.map(t => t.id === id ? todo : t))
      setOverdueTodos(overdueTodos.filter(t => t.id !== id))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDragEnd(event, day) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const dayTodos = todos.filter(t => t.day_of_week === day)
    const oldIndex = dayTodos.findIndex(t => t.id === active.id)
    const newIndex = dayTodos.findIndex(t => t.id === over.id)
    const reordered = arrayMove(dayTodos, oldIndex, newIndex)
    const otherTodos = todos.filter(t => t.day_of_week !== day)
    const previous = todos

    setTodos([...otherTodos, ...reordered.map((t, i) => ({ ...t, sort_order: i }))])

    try {
      // One request for the whole list, not one per task.
      await api('/api/todos/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: reordered.map(t => t.id) }),
      })
      setError('')
    } catch (e) {
      setTodos(previous)
      setError(e.message)
    }
  }

  const todosByDay = DAYS.reduce((acc, day) => {
    acc[day] = todos.filter(t => t.day_of_week === day)
    return acc
  }, {})

  const daysToRender = viewMode === 'day' ? [selectedDay] : DAYS

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-lg mx-auto px-4 py-6">

        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-gray-400 text-2xl">←</Link>
          <h1 className="text-2xl font-bold">Todos</h1>
          {overdueTodos.length > 0 && (
            <span className="bg-red-900 text-red-300 text-xs px-2 py-1 rounded-full">{overdueTodos.length} overdue</span>
          )}
          <div className="ml-auto flex gap-1">
            <button onClick={() => setViewMode('day')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'day' ? 'bg-blue-600' : 'bg-gray-800'}`}>Day</button>
            <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 rounded-lg text-sm ${viewMode === 'week' ? 'bg-blue-600' : 'bg-gray-800'}`}>Week</button>
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Day selector */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {DAYS.map((day, i) => (
            <button
              key={day}
              onClick={() => { setSelectedDay(day); setViewMode('day') }}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-sm transition flex flex-col items-center ${selectedDay === day && viewMode === 'day' ? 'bg-blue-600' : day === today ? 'bg-gray-700 ring-1 ring-blue-500' : 'bg-gray-800'}`}
            >
              <span>{day.slice(0, 3)}</span>
              <span className="text-xs opacity-60">{shortLabel(dateForDay(weekStart, i))}</span>
            </button>
          ))}
        </div>

        {/* Overdue banner */}
        {overdueTodos.length > 0 && (
          <div className="bg-red-950 border border-red-800 rounded-2xl mb-4 overflow-hidden">
            <button onClick={() => setShowOverdue(!showOverdue)} className="w-full flex items-center justify-between px-4 py-3">
              <span className="text-red-300 text-sm font-medium">⚠ {overdueTodos.length} overdue from previous weeks</span>
              <span className="text-red-400">{showOverdue ? '▼' : '▶'}</span>
            </button>
            {showOverdue && (
              <div className="px-4 pb-4 space-y-2">
                {overdueTodos.map(t => (
                  <div key={t.id} className="bg-red-900/30 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" onChange={() => toggleTodo(t.id, false)} className="accent-red-500 mt-1 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm">{t.title}</p>
                        {t.category && <p className="text-xs text-gray-500">[{t.category}]</p>}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <button onClick={() => moveToDay(t.id, today)} className="text-xs bg-blue-700 px-2 py-1 rounded-lg">→ Today</button>
                      {DAYS.filter(d => d !== t.day_of_week).map(d => (
                        <button key={d} onClick={() => moveToDay(t.id, d)} className="text-xs bg-gray-700 px-2 py-1 rounded-lg">{d.slice(0, 3)}</button>
                      ))}
                      <button onClick={() => setEditTodo(t)} className="text-xs bg-gray-700 px-2 py-1 rounded-lg ml-auto">✏ Edit</button>
                      <button onClick={() => deleteTodo(t.id)} className="text-xs bg-red-900 px-2 py-1 rounded-lg">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add task */}
        <div className="bg-gray-800 rounded-2xl p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="bg-gray-700 rounded-xl px-4 py-3 flex-1 outline-none text-base"
              placeholder="New task..."
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
            />
            <button onClick={addTodo} className="bg-blue-600 rounded-xl px-4 py-3 font-medium">Add</button>
          </div>
          <input
            className="w-full bg-gray-700 rounded-xl px-4 py-2 outline-none text-sm"
            placeholder="Category (optional)"
            value={newTask.category}
            onChange={e => setNewTask({ ...newTask, category: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Start Time</label>
              <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.start_time} onChange={e => setNewTask({ ...newTask, start_time: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">End Time</label>
              <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={newTask.end_time} onChange={e => setNewTask({ ...newTask, end_time: e.target.value })} />
            </div>
          </div>
          <select
            className="w-full bg-gray-700 rounded-xl px-4 py-2 outline-none text-sm"
            value={newTask.day_of_week}
            onChange={e => setNewTask({ ...newTask, day_of_week: e.target.value })}
          >
            {DAYS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setShowRoutines(!showRoutines)} className="text-xs text-gray-500">
            {showRoutines ? '▼ Hide Routines' : '▶ Show Routines'}
          </button>
          <span className="text-xs text-gray-600">{todos.filter(t => t.is_complete).length}/{todos.length} done</span>
        </div>

        {/* Edit modal */}
        {editTodo && (
          <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50" onClick={() => setEditTodo(null)}>
            <div className="bg-gray-900 rounded-t-3xl p-6 w-full max-w-lg space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-2" />
              <h2 className="font-bold text-lg">Edit Task</h2>
              <input className="w-full bg-gray-700 rounded-xl px-4 py-3 outline-none text-base" value={editTodo.title} onChange={e => setEditTodo({ ...editTodo, title: e.target.value })} />
              <input className="w-full bg-gray-700 rounded-xl px-4 py-2 outline-none text-sm" placeholder="Category" value={editTodo.category || ''} onChange={e => setEditTodo({ ...editTodo, category: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Start Time</label>
                  <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTodo.start_time || ''} onChange={e => setEditTodo({ ...editTodo, start_time: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">End Time</label>
                  <input type="time" className="w-full bg-gray-700 rounded-xl px-3 py-2 outline-none text-sm" value={editTodo.end_time || ''} onChange={e => setEditTodo({ ...editTodo, end_time: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Move to day</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map(d => (
                    <button key={d} onClick={() => setEditTodo({ ...editTodo, day_of_week: d })} className={`px-3 py-1.5 rounded-lg text-sm ${editTodo.day_of_week === d ? 'bg-blue-600' : 'bg-gray-700'}`}>{d.slice(0, 3)}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveEdit} className="flex-1 bg-blue-600 rounded-xl py-3 font-medium">Save</button>
                <button onClick={() => deleteTodo(editTodo.id)} className="bg-red-900 rounded-xl py-3 px-4">Delete</button>
                <button onClick={() => setEditTodo(null)} className="bg-gray-700 rounded-xl py-3 px-4">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {loading ? <p className="text-gray-400">Loading...</p> : (
          <div className={viewMode === 'week' ? 'space-y-4' : ''}>
            {daysToRender.map((day) => {
              const dayIndex = DAYS.indexOf(day)
              const isToday = day === today
              const dateLabel = shortLabel(dateForDay(weekStart, dayIndex))
              const dayTodos = todosByDay[day]

              return (
                <div key={day} className={viewMode === 'week' ? `rounded-2xl p-4 ${isToday ? 'bg-gray-700 ring-1 ring-blue-500' : 'bg-gray-800'}` : ''}>
                  {viewMode === 'week' && (
                    <h2 className={`font-semibold mb-3 flex items-center gap-2 ${isToday ? 'text-blue-400' : 'text-gray-300'}`}>
                      {day.slice(0, 3)} <span className="text-xs font-normal opacity-60">{dateLabel}</span>
                      {isToday && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">Today</span>}
                    </h2>
                  )}

                  {showRoutines && (
                    <div className="mb-3 space-y-2 border-b border-gray-600 pb-3">
                      {ROUTINES.map(routine => {
                        const applicable = isRoutineApplicable(routine, dayIndex)
                        const checked = routineChecks[`${day}_${routine.name}`]
                        return (
                          <div key={routine.name} className={`flex items-center gap-2 ${!applicable ? 'opacity-20' : ''}`}>
                            <input
                              type="checkbox"
                              checked={!!checked}
                              onChange={() => applicable && toggleRoutine(day, routine.name)}
                              disabled={!applicable}
                              className="accent-purple-500 w-4 h-4 flex-shrink-0"
                            />
                            <span className={`text-sm ${checked ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                              {routine.name}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, day)}>
                    <SortableContext items={dayTodos.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {dayTodos.length === 0 && <p className="text-gray-600 text-sm py-2">No tasks</p>}
                        {dayTodos.map(todo => (
                          <SortableTask
                            key={todo.id}
                            todo={todo}
                            onToggle={toggleTodo}
                            onEdit={setEditTodo}
                            onDelete={deleteTodo}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
