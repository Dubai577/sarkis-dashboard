/**
 * Export everything for hand-sorting.
 *
 *   node scripts/export-data.mjs
 *
 * Writes one editable text file per category in the format the bulk importer
 * reads, plus an index, plus a JSON sidecar holding everything the text format
 * deliberately does not carry — ids, timestamps, legacy links, and the portal
 * relationships.
 *
 * Read-only. Nothing is modified or deleted.
 */

import fs from 'node:fs'
import path from 'node:path'
import { serializeTree } from '../lib/textformat.ts'

const env = {}
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
}

const get = async (p) => {
  const res = await fetch(`${URL}/rest/v1/${p}`, { headers })
  if (!res.ok) return []
  return res.json()
}

const OUT = path.resolve('exports')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(path.join(OUT, 'categories'), { recursive: true })

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
const counts = {}

// ── load ─────────────────────────────────────────────────────────

const [
  items, categories, people, itemPeople, todos, notes,
  routines, projects, tasks, subtasks, contributors,
  members, subtaskAssignments, subtaskUpdates, taskResources,
  sarkis, sweat,
] = await Promise.all([
  get('items?select=*&order=sort_order'),
  get('categories?select=*&order=sort_order'),
  get('people?select=*&order=name'),
  get('item_people?select=*'),
  get('todos?select=*&order=task_date'),
  get('notes?select=*&order=created_at.desc'),
  get('routines?select=*&order=sort_order'),
  get('projects?select=*&order=name'),
  get('tasks?select=*&order=sort_order'),
  get('subtasks?select=*&order=sort_order'),
  get('contributors?select=*&order=name'),
  get('project_members?select=*'),
  get('subtask_assignments?select=*'),
  get('subtask_updates?select=*'),
  get('task_resources?select=*'),
  get('sarkis_tasks?select=*&order=category'),
  get('sweat_tasks?select=*'),
])

const catById = new Map(categories.map(c => [c.id, c]))
const personById = new Map(people.map(p => [p.id, p]))
const itemById = new Map(items.map(i => [i.id, i]))

const HEADER = `# ============================================================
# MERC EXPORT — edit freely, then send back.
#
# Format:  title | annotations
#
#   #Category      category            #Convent   #{OCCM VT}
#   @2026-09-01    planned date — when I intend to do it
#   !2026-09-15    due date — the real deadline
#   ~Name          waiting on someone  ~Fady      ~{Fady Mansour}
#   ^14            nudge after N days (default 7)
#   +Urgent        priority: Urgent | Soon | Whenever | N/A
#   %working       status: notstarted | working | done
#   *pinned        board: pinned | muted (default auto)
#
#   Multi-word values go in braces.
#   Indent two spaces to make a line a child of the line above.
#   A line starting '>' is a note on the line above.
#   A line starting '[x]' is archived.
#   Lines starting '#' at the left margin are comments and are ignored.
#
# Everything after the pipe is optional. A bare line is a perfectly good item.
# Delete anything you do not want. Reorder freely. Add new lines anywhere.
# ============================================================
`

// ── items, one file per category ─────────────────────────────────

const toNode = (item) => ({
  title: item.title,
  notes: item.notes ?? undefined,
  category: item.category_id ? catById.get(item.category_id)?.name : undefined,
  planned_date: item.planned_date ?? undefined,
  due_date: item.due_date ?? undefined,
  waiting_on: item.waiting_on ? personById.get(item.waiting_on)?.name : undefined,
  nudge_after: item.nudge_after ?? undefined,
  priority: item.priority ?? undefined,
  status: item.status ?? undefined,
  board: item.board ?? undefined,
  archived: !!item.archived_at,
  children: items
    .filter(c => c.parent_id === item.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(toNode),
})

const roots = items.filter(i => !i.parent_id)
const indexRows = []

for (const category of categories) {
  const catRoots = roots.filter(r => r.category_id === category.id)
  const uncategorised = []
  const live = catRoots.filter(r => !r.archived_at).map(toNode)
  const archived = catRoots.filter(r => r.archived_at).map(toNode)

  // A root with no category still belongs somewhere.
  if (category.sort_order === categories[0].sort_order) {
    for (const r of roots.filter(r => !r.category_id)) uncategorised.push(toNode(r))
  }

  const body = [
    HEADER,
    `# CATEGORY: ${category.name}${category.is_area ? '  (life area — receded on the board)' : ''}`,
    `# colour ${category.color}`,
    '',
    live.length ? serializeTree(live) : '# (nothing live in this category)',
  ]

  if (archived.length) {
    body.push('', '# ---------- ARCHIVED ----------',
      '# Already closed. Delete these lines to drop them from the re-import.', '',
      serializeTree(archived))
  }

  const countLive = live.reduce((n, x) => n + 1 + countTree(x), 0)
  const countArchived = archived.reduce((n, x) => n + 1 + countTree(x), 0)

  const file = path.join('categories', `${slug(category.name)}.txt`)
  fs.writeFileSync(path.join(OUT, file), body.join('\n') + '\n')
  counts[file] = countLive + countArchived
  indexRows.push({ file, category: category.name, live: countLive, archived: countArchived })
}

function countTree(node) {
  return node.children.reduce((n, c) => n + 1 + countTree(c), 0)
}

// Roots with no category at all.
const orphanRoots = roots.filter(r => !r.category_id)
if (orphanRoots.length) {
  const nodes = orphanRoots.map(toNode)
  const total = nodes.reduce((n, x) => n + 1 + countTree(x), 0)
  const file = path.join('categories', '_uncategorised.txt')
  fs.writeFileSync(
    path.join(OUT, file),
    [HEADER, '# CATEGORY: (none)', '# These have no category. Add one with #Name if you want.', '',
      serializeTree(nodes)].join('\n') + '\n',
  )
  counts[file] = total
  indexRows.push({ file, category: '(uncategorised)', live: total, archived: 0 })
}

// ── notes ────────────────────────────────────────────────────────

fs.writeFileSync(path.join(OUT, 'notes.txt'),
  [HEADER, '# NOTES — the capture inbox.',
    '# One note per block. A blank line separates them.',
    '# Turn any of these into items by moving the text into a category file.', '',
    notes.map(n => `${n.content.split('\n').map((l, i) => (i === 0 ? l : `> ${l}`)).join('\n')}\n# captured ${n.created_at.slice(0, 10)}`).join('\n\n'),
  ].join('\n') + '\n')
counts['notes.txt'] = notes.length

// ── todos ────────────────────────────────────────────────────────

const todoLines = todos.map(t => {
  const bits = [`@${t.task_date}`]
  if (t.is_complete) bits.push('%done')
  if (t.source_item_id) bits.push(`#{from item: ${itemById.get(t.source_item_id)?.title ?? t.source_item_id}}`)
  if (t.roll_count) bits.push(`^${t.roll_count}`)
  return `${t.is_complete ? '[x] ' : ''}${t.title} | ${bits.join(' ')}`
})
fs.writeFileSync(path.join(OUT, 'todos.txt'),
  [HEADER, '# TODOS — the dated week list.',
    '# Rows marked "from item" are materialized from an item and will be recreated',
    '# automatically from that item\'s planned date. You do not need to keep them.', '',
    ...todoLines].join('\n') + '\n')
counts['todos.txt'] = todos.length

// ── people ───────────────────────────────────────────────────────

const peopleLines = people.map(p => {
  const involved = itemPeople.filter(l => l.person_id === p.id)
    .map(l => itemById.get(l.item_id)?.title).filter(Boolean)
  const waiting = items.filter(i => i.waiting_on === p.id).map(i => i.title)
  const lines = [`${p.name} | ${[p.role_name && `+${p.role_name.replace(/\s/g, '_')}`].filter(Boolean).join(' ')}`.trim()]
  if (p.email) lines.push(`> email ${p.email}`)
  if (p.phone) lines.push(`> phone ${p.phone}`)
  for (const t of waiting) lines.push(`> waiting on them for: ${t}`)
  for (const t of involved) lines.push(`> involved in: ${t}`)
  return lines.join('\n')
})
fs.writeFileSync(path.join(OUT, 'people.txt'),
  [HEADER, '# PEOPLE — 19 records, linked to portal contributors.',
    '# Delete anyone who should not come across.', '', ...peopleLines].join('\n') + '\n')
counts['people.txt'] = people.length

// ── portal ───────────────────────────────────────────────────────

const portalLines = []
for (const project of projects) {
  const projectTasks = tasks.filter(t => t.project_id === project.id)
  portalLines.push(`${project.name.trim()} | *pinned`)
  if (project.description) portalLines.push(`> ${project.description}`)
  for (const task of projectTasks) {
    portalLines.push(`  ${task.title}${task.due_date ? ` | !${task.due_date}` : ''}`)
    for (const sub of subtasks.filter(s => s.task_id === task.id)) {
      const assigned = subtaskAssignments.filter(a => a.subtask_id === sub.id)
      const who = assigned.map(a => contributors.find(c => c.id === a.contributor_id)?.name).filter(Boolean)
      const done = assigned.filter(a => a.status === 'completed').length
      const mark = assigned.length > 0 && done === assigned.length ? '[x] ' : ''
      portalLines.push(`    ${mark}${sub.title}${who.length ? ` | ~{${who.join(', ')}}` : ''}`)
    }
  }
  portalLines.push('')
}
fs.writeFileSync(path.join(OUT, 'portal.txt'),
  [HEADER, '# PORTAL — projects, tasks, subtasks and who is assigned.',
    '# This data lives in the portal tables, NOT in the items tree, so it is not',
    '# part of the normal export above. Assignments and completions are shown as',
    '# notes; the authoritative copy is in _raw/ alongside.', '', ...portalLines].join('\n') + '\n')
counts['portal.txt'] = projects.length + tasks.length + subtasks.length

// ── legacy tables ────────────────────────────────────────────────

const byCat = {}
for (const s of sarkis) (byCat[s.category ?? '(none)'] ??= []).push(s)
fs.writeFileSync(path.join(OUT, 'legacy-sarkis.txt'),
  [HEADER, '# SARKIS_TASKS — the original backlog table, still present and unread.',
    '# Everything here was migrated into items already; this is the untouched original.', '',
    ...Object.entries(byCat).flatMap(([cat, rows]) => [
      `# --- ${cat} (${rows.length}) ---`,
      ...rows.map(r => {
        const bits = []
        if (r.category) bits.push(`#${/\s/.test(r.category) ? `{${r.category}}` : r.category}`)
        if (r.planned_date) bits.push(`@${r.planned_date}`)
        if (r.due_date) bits.push(`!${r.due_date}`)
        if (r.priority && r.priority !== 'N/A') bits.push(`+${r.priority}`)
        return `${r.title} | ${bits.join(' ')}`.trim().replace(/\|\s*$/, '').trim()
      }),
      '',
    ])].join('\n') + '\n')
counts['legacy-sarkis.txt'] = sarkis.length

fs.writeFileSync(path.join(OUT, 'legacy-sweat.txt'),
  [HEADER, '# SWEAT_TASKS — the original coursework table, still present and unread.', '',
    ...sweat.map(s => {
      const bits = []
      if (s.my_due_date) bits.push(`@${s.my_due_date}`)
      if (s.actual_due_date ?? s.due_date) bits.push(`!${s.actual_due_date ?? s.due_date}`)
      if (s.is_complete) bits.push('%done')
      return `${s.course}: ${s.title} | ${bits.join(' ')}`.trim()
    })].join('\n') + '\n')
counts['legacy-sweat.txt'] = sweat.length

// ── raw JSON sidecar ─────────────────────────────────────────────

fs.mkdirSync(path.join(OUT, '_raw'), { recursive: true })
const raw = {
  items, categories, people, item_people: itemPeople, todos, notes, routines,
  projects, tasks, subtasks, contributors, project_members: members,
  subtask_assignments: subtaskAssignments, subtask_updates: subtaskUpdates,
  task_resources: taskResources, sarkis_tasks: sarkis, sweat_tasks: sweat,
}
for (const [name, rows] of Object.entries(raw)) {
  fs.writeFileSync(path.join(OUT, '_raw', `${name}.json`), JSON.stringify(rows, null, 1))
}

// ── index ────────────────────────────────────────────────────────

const indexLines = [
  '# MERC EXPORT — index',
  `# taken ${new Date().toISOString()}`,
  '',
  '# Work through categories/ one file at a time. Everything else is reference.',
  '',
  '## categories/',
  ...indexRows
    .sort((a, b) => b.live - a.live)
    .map(r => `  ${r.file.replace('categories' + path.sep, '').padEnd(26)} ${String(r.live).padStart(4)} live${r.archived ? `, ${r.archived} archived` : ''}   (${r.category})`),
  '',
  '## other files',
  `  notes.txt                  ${String(notes.length).padStart(4)} notes`,
  `  todos.txt                  ${String(todos.length).padStart(4)} dated rows`,
  `  people.txt                 ${String(people.length).padStart(4)} people`,
  `  portal.txt                 ${String(projects.length).padStart(4)} projects, ${tasks.length} tasks, ${subtasks.length} subtasks`,
  `  legacy-sarkis.txt          ${String(sarkis.length).padStart(4)} rows (original backlog table)`,
  `  legacy-sweat.txt           ${String(sweat.length).padStart(4)} rows (original coursework table)`,
  '',
  '## _raw/',
  '  Full JSON of every table. Ids, timestamps, legacy links and portal',
  '  relationships live here — nothing in the text files is authoritative for',
  '  those. You do not need to edit anything in _raw/.',
  '',
  ...Object.entries(raw).map(([n, rows]) => `  ${(n + '.json').padEnd(28)} ${String(rows.length).padStart(4)} rows`),
]
fs.writeFileSync(path.join(OUT, 'INDEX.txt'), indexLines.join('\n') + '\n')

// ── report ───────────────────────────────────────────────────────

console.log(`\nexported to ${OUT}\n`)
for (const [file, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${file.padEnd(38)} ${String(n).padStart(4)}`)
}
const itemsWritten = indexRows.reduce((n, r) => n + r.live + r.archived, 0)
console.log(`\n  items written to text: ${itemsWritten} of ${items.length}`)
if (itemsWritten !== items.length) {
  console.log(`  ⚠ ${items.length - itemsWritten} items missing from the text files — check _raw/items.json`)
  process.exitCode = 1
}
console.log(`  raw JSON tables: ${Object.keys(raw).length}\n`)
