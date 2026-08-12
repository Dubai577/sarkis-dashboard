'use client'

import { useCallback, useEffect, useState } from 'react'
import { SlackBar } from '@/app/calendar/page'
import {
  Button, Check, EmptyState, ErrorBanner, Field, Sheet, Spinner, inputClass,
} from '@/components/ui/primitives'
import { today as todayIso } from '@/lib/dates'

/**
 * Sweat — coursework, on the two-date model.
 *
 *   my due date      when I intend to finish
 *   actual due date  the professor's real deadline
 *
 * The gap between them is the whole feature, so the list is grouped by course
 * and each row draws its slack rather than printing two dates and leaving the
 * subtraction to the reader.
 *
 * Built for a full September load, not the two rows currently present — it is
 * August and the semester has not started.
 */

const TYPES = ['HW', 'Exam', 'Lab', 'Project', 'Other']

async function api(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (res.status === 401) { window.location.href = '/login?next=/sweat'; throw new Error('Session expired.') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed.')
  return data
}

export default function SweatPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hideDone, setHideDone] = useState(true)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const { tasks } = await api('/api/sweat')
      setTasks(tasks)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(task) {
    const next = !task.is_complete
    setTasks(tasks.map(t => (t.id === task.id ? { ...t, is_complete: next } : t)))
    try {
      await api(`/api/sweat/${task.id}`, { method: 'PATCH', body: JSON.stringify({ is_complete: next }) })
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  async function save(body, id) {
    try {
      if (id) await api(`/api/sweat/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      else await api('/api/sweat', { method: 'POST', body: JSON.stringify(body) })
      setEditing(null)
      setAdding(false)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <Spinner label="Loading coursework" />

  const visible = hideDone ? tasks.filter(t => !t.is_complete) : tasks

  // Grouped by course, because that is how a semester is actually held in mind.
  const courses = {}
  for (const task of visible) {
    const key = (task.course || 'Unassigned').trim()
    ;(courses[key] ??= []).push(task)
  }
  for (const list of Object.values(courses)) {
    list.sort((a, b) =>
      (a.actual_due_date || a.my_due_date || '9999').localeCompare(b.actual_due_date || b.my_due_date || '9999'))
  }

  const noSlack = visible.filter(t => t.my_due_date && t.actual_due_date && t.my_due_date >= t.actual_due_date)

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <header className="mb-4 flex items-center gap-2">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Sweat</h1>
          <p className="text-sm text-ink-2">
            {visible.length} open across {Object.keys(courses).length} courses
          </p>
        </div>
        <Button variant="quiet" onClick={() => setHideDone(!hideDone)}>
          {hideDone ? 'Show done' : 'Hide done'}
        </Button>
        <Button variant="primary" onClick={() => setAdding(true)}>Add</Button>
      </header>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      {noSlack.length > 0 && (
        <p className="mb-4 rounded-md border border-mine/30 bg-mine-soft px-3 py-2 text-[11px] text-mine">
          {noSlack.length} {noSlack.length === 1 ? 'assignment has' : 'assignments have'} no slack —
          your date is on or after the real deadline.
        </p>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing due."
          hint="Between semesters this is correct. Add assignments as the syllabus lands."
          action={<Button variant="quiet" onClick={() => setAdding(true)}>Add one</Button>}
        />
      ) : (
        <div className="space-y-5">
          {Object.entries(courses).map(([course, list]) => (
            <section key={course}>
              <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-ink-2">
                {course}
                <span className="ml-2 tnum text-ink-3">{list.length}</span>
              </h2>
              <div className="space-y-1.5">
                {list.map(task => (
                  <div key={task.id} className="rounded-md border border-line bg-surface px-2.5 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <Check checked={task.is_complete} onChange={() => toggle(task)}
                             label={`Complete ${task.title}`} />
                      <button onClick={() => setEditing({ ...task })} className="min-w-0 flex-1 text-left">
                        <div className={`clamp-1 text-sm ${task.is_complete ? 'text-ink-3 line-through' : ''}`}>
                          {task.title}
                        </div>
                        {task.assignment_type && (
                          <div className="mt-0.5 text-[10px] text-ink-3">{task.assignment_type}</div>
                        )}
                      </button>
                    </div>
                    {!task.is_complete && (
                      <SlackBar
                        myDate={task.my_due_date}
                        actualDate={task.actual_due_date}
                        today={todayIso()}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet open={adding || !!editing} onClose={() => { setAdding(false); setEditing(null) }}
             title={editing ? 'Edit assignment' : 'New assignment'}>
        <SweatForm
          task={editing}
          onSave={body => save(body, editing?.id)}
          onDelete={editing ? async () => {
            await api(`/api/sweat/${editing.id}`, { method: 'DELETE' })
            setEditing(null)
            load()
          } : null}
        />
      </Sheet>
    </div>
  )
}

function SweatForm({ task, onSave, onDelete }) {
  const [course, setCourse] = useState(task?.course ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [type, setType] = useState(task?.assignment_type ?? 'HW')
  const [mine, setMine] = useState(task?.my_due_date ?? '')
  const [actual, setActual] = useState(task?.actual_due_date ?? '')

  const slack = mine && actual
    ? Math.round((Date.parse(actual + 'T12:00:00Z') - Date.parse(mine + 'T12:00:00Z')) / 86400000)
    : null

  return (
    <div className="space-y-3">
      <Field label="Course">
        <input value={course} onChange={e => setCourse(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Assignment">
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Type">
        <select value={type} onChange={e => setType(e.target.value)} className={inputClass}>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="My date">
          <input type="date" value={mine} onChange={e => setMine(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Real deadline">
          <input type="date" value={actual} onChange={e => setActual(e.target.value)} className={inputClass} />
        </Field>
      </div>

      {slack !== null && (
        <p className={`text-[11px] ${slack > 0 ? 'text-ink-3' : 'text-mine'}`}>
          {slack > 0
            ? `${slack} days of room between your date and the real one.`
            : 'No room — your date is on or after the real deadline.'}
        </p>
      )}

      <Button variant="primary" full
              onClick={() => onSave({
                course, title, assignment_type: type,
                my_due_date: mine || null, actual_due_date: actual || null,
              })}
              disabled={!title.trim() || !course.trim()}>
        Save
      </Button>

      {onDelete && <Button variant="danger" full onClick={onDelete}>Delete</Button>}
    </div>
  )
}
