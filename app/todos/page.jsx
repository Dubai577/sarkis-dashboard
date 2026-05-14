'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Link from 'next/link'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.toISOString().split('T')[0]
  return monday.toISOString().split('T')[0]
}

export default function TodosPage() {
  const [todos, setTodos] = useState([])
  const [newTask, setNewTask] = useState({ title: '', day_of_week: 'Monday' })
  const [loading, setLoading] = useState(true)

  const weekStart = getWeekStart()

  useEffect(() => {
    fetchTodos()
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

  async function addTodo() {
    if (!newTask.title.trim()) return
    const { data, error } = await supabase
      .from('todos')
      .insert([{ ...newTask, week_start: weekStart }])
      .select()
    if (!error) {
      setTodos([...todos, ...data])
      setNewTask({ title: '', day_of_week: newTask.day_of_week })
    }
  }

  async function toggleTodo(id, current) {
    const { error } = await supabase
      .from('todos')
      .update({ is_complete: !current, completed_at: !current ? new Date().toISOString() : null })
      .eq('id', id)
    if (!error) setTodos(todos.map(t => t.id === id ? { ...t, is_complete: !current } : t))
  }

  async function deleteTodo(id) {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(todos.filter(t => t.id !== id))
  }

  const todosByDay = DAYS.reduce((acc, day) => {
    acc[day] = todos.filter(t => t.day_of_week === day)
    return acc
  }, {})

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
          <h1 className="text-2xl font-bold">Weekly Todos</h1>
          <span className="text-gray-500 text-sm">Week of {weekStart}</span>
        </div>

        <div className="flex gap-2 mb-8">
          <input
            className="bg-gray-800 rounded-lg px-4 py-2 flex-1 outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="New task..."
            value={newTask.title}
            onChange={e => setNewTask({ ...newTask, title: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
          />
          <select
            className="bg-gray-800 rounded-lg px-3 py-2 outline-none"
            value={newTask.day_of_week}
            onChange={e => setNewTask({ ...newTask, day_of_week: e.target.value })}
          >
            {DAYS.map(d => <option key={d}>{d}</option>)}
          </select>
          <button
            onClick={addTodo}
            className="bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-2 font-medium transition"
          >
            Add
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {DAYS.map(day => (
              <div key={day} className="bg-gray-800 rounded-xl p-4">
                <h2 className="font-semibold text-gray-300 mb-3 text-sm uppercase tracking-wide">{day}</h2>
                <div className="space-y-2">
                  {todosByDay[day].length === 0 && (
                    <p className="text-gray-600 text-sm">No tasks</p>
                  )}
                  {todosByDay[day].map(todo => (
                    <div key={todo.id} className="flex items-center gap-2 group">
                      <input
                        type="checkbox"
                        checked={todo.is_complete}
                        onChange={() => toggleTodo(todo.id, todo.is_complete)}
                        className="accent-blue-500"
                      />
                      <span className={`text-sm flex-1 ${todo.is_complete ? 'line-through text-gray-500' : ''}`}>
                        {todo.title}
                      </span>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-xs"
                      >
                        ✕
                      </button>
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