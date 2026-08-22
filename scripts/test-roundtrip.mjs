/**
 * Round-trip proof: everything the exporter writes, the importer reads back
 * identically.
 *
 *   node scripts/test-roundtrip.mjs
 *
 * Reads the generated exports/ files with the same parser the bulk import API
 * uses, and compares every field against the raw JSON. A format that loses a
 * field silently is worse than no format at all, so this fails loudly.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parseText, flatten, serializeTree } from '../lib/textformat.ts'

const OUT = path.resolve('exports')
if (!fs.existsSync(OUT)) {
  console.error('No exports/ directory. Run: node scripts/export-data.mjs')
  process.exit(1)
}

const raw = (name) => JSON.parse(fs.readFileSync(path.join(OUT, '_raw', `${name}.json`), 'utf8'))

const items = raw('items')
const categories = raw('categories')
const people = raw('people')

const catName = new Map(categories.map(c => [c.id, c.name]))
const personName = new Map(people.map(p => [p.id, p.name]))

let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  ok ? pass++ : fail++
  if (!ok) console.log(`  FAIL  ${label}  ${detail}`)
}

// Parse every category file back.
const parsed = []
for (const file of fs.readdirSync(path.join(OUT, 'categories'))) {
  const text = fs.readFileSync(path.join(OUT, 'categories', file), 'utf8')
  parsed.push(...flatten(parseText(text)))
}

console.log(`\n  parsed ${parsed.length} nodes from ${fs.readdirSync(path.join(OUT, 'categories')).length} category files`)
console.log(`  database holds ${items.length} items\n`)

check('every item survives the round trip', parsed.length === items.length,
  `parsed ${parsed.length}, expected ${items.length}`)

// Match by title — unique enough in this data, and it is what a human edits.
const byTitle = new Map()
for (const node of parsed) {
  const list = byTitle.get(node.title) ?? []
  list.push(node)
  byTitle.set(node.title, list)
}

let compared = 0
for (const item of items) {
  const candidates = byTitle.get(item.title.trim())
  if (!candidates || candidates.length === 0) {
    check(`"${item.title.slice(0, 40)}" present`, false, 'not found in any text file')
    continue
  }
  const node = candidates[0]
  compared++

  const expectCat = item.category_id ? catName.get(item.category_id) : undefined
  check(`category of "${item.title.slice(0, 28)}"`, (node.category ?? undefined) === (expectCat ?? undefined),
    `got ${node.category}, expected ${expectCat}`)

  check(`planned of "${item.title.slice(0, 28)}"`,
    (node.planned_date ?? null) === (item.planned_date ?? null),
    `got ${node.planned_date}, expected ${item.planned_date}`)

  check(`due of "${item.title.slice(0, 28)}"`,
    (node.due_date ?? null) === (item.due_date ?? null),
    `got ${node.due_date}, expected ${item.due_date}`)

  const expectPerson = item.waiting_on ? personName.get(item.waiting_on) : undefined
  check(`waiting_on of "${item.title.slice(0, 28)}"`,
    (node.waiting_on ?? undefined) === (expectPerson ?? undefined),
    `got ${node.waiting_on}, expected ${expectPerson}`)

  check(`archived of "${item.title.slice(0, 28)}"`,
    !!node.archived === !!item.archived_at,
    `got ${node.archived}, expected ${!!item.archived_at}`)

  const expectStatus = item.status ?? undefined
  if (expectStatus && ["Haven't Started", 'Working on it', 'Done'].includes(expectStatus)) {
    check(`status of "${item.title.slice(0, 28)}"`, node.status === expectStatus,
      `got ${node.status}, expected ${expectStatus}`)
  }

  if (item.notes) {
    check(`notes of "${item.title.slice(0, 28)}"`, (node.notes ?? '').trim() === item.notes.trim(),
      `got ${JSON.stringify((node.notes ?? '').slice(0, 30))}`)
  }

  if (item.board && item.board !== 'auto') {
    check(`board of "${item.title.slice(0, 28)}"`, node.board === item.board,
      `got ${node.board}, expected ${item.board}`)
  }
}

// Parent/child structure survives.
const dbChildren = new Map()
for (const i of items) {
  if (i.parent_id) dbChildren.set(i.parent_id, (dbChildren.get(i.parent_id) ?? 0) + 1)
}
let structureOk = true
for (const item of items.filter(i => dbChildren.has(i.id))) {
  const node = (byTitle.get(item.title.trim()) ?? [])[0]
  if (!node) continue
  if (node.children.length !== dbChildren.get(item.id)) {
    structureOk = false
    console.log(`  FAIL  children of "${item.title.slice(0, 34)}": got ${node.children.length}, expected ${dbChildren.get(item.id)}`)
  }
}
check('parent/child structure preserved', structureOk)

// Serializing what we parsed must round-trip — proof the format is stable and
// not merely lossy in one direction.
//
// Compared by MEANING, not by key order. Serialization writes annotations in a
// canonical order, so a hand-edited file with '&{link}' before '@date' parses
// to the same fields in a different insertion order. Comparing raw JSON would
// report that as a failure, which would train us to ignore this check.
const canon = (nodes) =>
  nodes.map(n => ({
    title: n.title, category: n.category ?? null, planned_date: n.planned_date ?? null,
    due_date: n.due_date ?? null, link: n.link ?? null, waiting_on: n.waiting_on ?? null,
    nudge_after: n.nudge_after ?? null, priority: n.priority ?? null,
    status: n.status ?? null, board: n.board ?? null, archived: !!n.archived,
    notes: n.notes ?? null, children: canon(n.children),
  }))

const sampleFile = path.join(OUT, 'categories', 'occm-vt.txt')
if (fs.existsSync(sampleFile)) {
  const once = parseText(fs.readFileSync(sampleFile, 'utf8'))
  const twice = parseText(serializeTree(once))
  check('serialize → parse is stable', JSON.stringify(canon(once)) === JSON.stringify(canon(twice)))
}

// And the same, for a line using every annotation with them out of order.
{
  const messy = 'portal work | &{https://x.example.com/a?b=1&c=2} %working #Convent ^14 @2026-09-01 +Urgent !2026-09-15 *pinned'
  const once = parseText(messy)
  const twice = parseText(serializeTree(once))
  check('annotations in any order round-trip', JSON.stringify(canon(once)) === JSON.stringify(canon(twice)))
  check('  link with & and = survives', once[0].link === 'https://x.example.com/a?b=1&c=2')
  check('  javascript: is refused', parseText('x | &{javascript:alert(1)}')[0].link === undefined)
}

console.log(`\n  compared ${compared} items across ${pass + fail} assertions`)
console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`)
process.exitCode = fail === 0 ? 0 : 1
