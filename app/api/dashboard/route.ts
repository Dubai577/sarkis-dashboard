import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { denyUnlessAdmin } from '@/lib/auth/guard'
import { serverError } from '@/lib/api/http'
import { addDays, dateForDay, today as todayIso, weekStart } from '@/lib/dates'
import { loadItemViews, boardItems } from '@/lib/db/items'
import { runRollover } from '@/lib/db/rollover'
import { runSync } from '@/lib/db/sync'

/**
 * Everything the dashboard shows, in one request.
 *
 * The contributor panel reads the PORTAL's own tables — projects, tasks,
 * subtasks, subtask_assignments — not items. That data has not moved and the
 * portal is paused, so this is deliberately read-only and deliberately not
 * wired to the tree. If Release 5 relocates it, only this block is repointed.
 */
export async function GET() {
  const denied = await denyUnlessAdmin()
  if (denied) return denied

  const now = todayIso()
  const start = weekStart(now)

  try {
    // The dashboard is the landing screen, so it carries the catch-up.
    await runRollover('lazy', now)
    await runSync(now)

    const db = createAdminClient()

    const [
      todayRes, weekRes, notesRes, routinesRes, checksRes,
      assignRes, contribRes, projRes, items,
    ] = await Promise.all([
      db.from('todos').select('*').eq('task_date', now).order('sort_order'),
      db.from('todos').select('id,task_date,is_complete')
        .gte('task_date', start).lte('task_date', addDays(start, 6)),
      db.from('notes').select('id,content,created_at').order('created_at', { ascending: false }).limit(6),
      db.from('routines').select('id,name,cadence,weekday,anchor_date,sort_order,is_active').eq('is_active', true),
      db.from('routine_checks').select('routine_id').eq('check_date', now),
      db.from('subtask_assignments')
        .select('id,status,completed_at,contributors(name),subtasks(title,tasks(title,project_id))')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(200),
      db.from('contributors').select('id,name'),
      db.from('projects').select('id,name,color'),
      loadItemViews({ now }),
    ])

    const [overdueRes, { data: catRows }, { data: peopleRows }] = await Promise.all([
      db.from('todos').select('id').lt('week_start', start).eq('is_complete', false),
      db.from('categories').select('id,name,color').order('sort_order'),
      db.from('people').select('id,name').order('name'),
    ])

    // ── week strip ──
    const weekRows = weekRes.data ?? []
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = dateForDay(start, index)
      const onDay = weekRows.filter(t => t.task_date === date)
      return {
        date,
        total: onDay.length,
        done: onDay.filter(t => t.is_complete).length,
        isToday: date === now,
      }
    })

    // ── project rows, for the expanded view ──
    const projectChildren = new Map<string, { id: string; title: string; possession: string }[]>()
    for (const i of items) {
      if (!i.parent_id) continue
      const list = projectChildren.get(i.parent_id) ?? []
      if (list.length < 6) list.push({ id: i.id, title: i.title, possession: i.possession })
      projectChildren.set(i.parent_id, list)
    }

    // ── projects, compact ──
    const projects = boardItems(items)
      .map(p => ({
        id: p.id,
        title: p.title,
        color: p.category?.color ?? null,
        open: p.open_child_count,
        total: p.child_count,
        dropped: p.blocked_child_count,
        possession: p.possession,
        heat: p.heat,
        isSchool: p.category?.name === 'School',
        category_id: p.category_id,
        waiting_person: p.waiting_person,
        children: projectChildren.get(p.id) ?? [],
      }))
      .sort((a, b) => b.heat - a.heat)

    // ── the two states nothing else surfaces ──
    const dropped = items
      .filter(i => i.possession === 'dropped')
      .sort((a, b) => b.heat - a.heat)
      .map(i => ({
        id: i.id, title: i.title,
        category: i.category ? { name: i.category.name, color: i.category.color } : null,
        waiting_person: i.waiting_person,
        waiting_since: i.waiting_since,
        nudge_after: i.nudge_after,
        possession: i.possession,
        waiting_on: i.waiting_on,
      }))

    // ── who I am waiting on, grouped by person ──
    const waitingByPerson = new Map<string, { id: string; name: string; items: { id: string; title: string; days: number | null; dropped: boolean }[] }>()
    for (const i of items) {
      if (!i.waiting_on || !i.waiting_person) continue
      const entry = waitingByPerson.get(i.waiting_on)
        ?? { id: i.waiting_person.id, name: i.waiting_person.name, items: [] }
      entry.items.push({
        id: i.id,
        title: i.title,
        days: i.waiting_since
          ? Math.round((Date.parse(`${now}T12:00:00Z`) - Date.parse(`${i.waiting_since}T12:00:00Z`)) / 86400000)
          : null,
        dropped: i.possession === 'dropped',
      })
      waitingByPerson.set(i.waiting_on, entry)
    }
    const waiting = [...waitingByPerson.values()]
      .sort((a, b) => Number(b.items.some(x => x.dropped)) - Number(a.items.some(x => x.dropped))
        || b.items.length - a.items.length)

    // ── school: deadlines behave differently, so they get their own panel ──
    const school = items
      .filter(i => i.category?.name === 'School' && i.parent_id && !i.archived_at)
      .filter(i => i.due_date || i.planned_date)
      .sort((a, b) => (a.due_date ?? a.planned_date ?? '9999').localeCompare(b.due_date ?? b.planned_date ?? '9999'))
      .slice(0, 6)
      .map(i => ({
        id: i.id, title: i.title,
        planned_date: i.planned_date, due_date: i.due_date,
      }))

    // ── contributor activity, from the portal tables ──
    const projectName = new Map((projRes.data ?? []).map(p => [p.id, p.name?.trim()]))
    const assignments = (assignRes.data ?? []) as Record<string, unknown>[]

    const shape = (a: Record<string, unknown>) => {
      const subtask = a.subtasks as Record<string, unknown> | null
      const task = subtask?.tasks as Record<string, unknown> | null
      const person = a.contributors as Record<string, unknown> | null
      return {
        id: String(a.id),
        status: String(a.status),
        completed_at: (a.completed_at as string) ?? null,
        who: (person?.name as string) ?? 'Someone',
        what: (subtask?.title as string) ?? 'a task',
        task: (task?.title as string) ?? null,
        project: task?.project_id ? projectName.get(task.project_id as string) ?? null : null,
      }
    }

    const recentDone = assignments
      .filter(a => a.status === 'completed')
      .map(shape)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
      .slice(0, 6)

    const outstandingByProject = new Map<string, number>()
    for (const a of assignments.filter(a => a.status !== 'completed').map(shape)) {
      const key = a.project ?? 'Unassigned'
      outstandingByProject.set(key, (outstandingByProject.get(key) ?? 0) + 1)
    }

    const done = new Set((checksRes.data ?? []).map(c => c.routine_id))

    return NextResponse.json({
      date: now,
      weekStart: start,
      todos: todayRes.data ?? [],
      overdueCount: overdueRes.data?.length ?? 0,
      droppedCount: items.filter(i => i.possession === 'dropped').length,
      week,
      projects,
      school,
      notes: notesRes.data ?? [],
      dropped,
      waiting,
      categories: catRows ?? [],
      people: peopleRows ?? [],
      routines: {
        total: (routinesRes.data ?? []).length,
        done: done.size,
      },
      contributors: {
        people: (contribRes.data ?? []).length,
        recentDone,
        outstanding: [...outstandingByProject.entries()]
          .map(([project, count]) => ({ project, count }))
          .sort((a, b) => b.count - a.count),
      },
    })
  } catch (err) {
    return serverError('dashboard.GET', err)
  }
}
