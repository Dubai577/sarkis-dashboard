/**
 * Release 1b verification — checks migration 007 landed correctly and that
 * nothing outside the four new tables changed.
 *
 *   node scripts/verify-items.mjs
 *
 * Read-only. Safe to run before the migration too — it will simply report that
 * the tables do not exist yet.
 */

import fs from 'node:fs'
import path from 'node:path'

const env = {}
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const get = async (p) => {
  const res = await fetch(`${URL}/rest/v1/${p}`, { headers })
  if (!res.ok) return null
  return res.json()
}

let fail = 0
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  if (!ok) fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${actual}${ok ? '' : `   expected ${expected}`}`)
}

const items = await get('items?select=*')
if (!items) {
  console.log('\n  items table does not exist — migration 007 has not been applied.\n')
} else {
  await report(items)
}

async function report(items) {
const [categories, people, links, sarkis, projects, contributors, sweat, school] = await Promise.all([
  get('categories?select=*'),
  get('people?select=*'),
  get('item_people?select=*'),
  get('sarkis_tasks?select=id,category,subcategory'),
  get('projects?select=id,name'),
  get('contributors?select=id'),
  get('sweat_tasks?select=id,due_date,actual_due_date'),
  // Migration 012 moved coursework into the tree, so the expected counts below
  // are derived rather than hardcoded — otherwise a later migration makes this
  // verifier report a failure that is really just its own staleness.
  get('items?select=id&legacy_sweat_id=not.is.null'),
])

const schoolMigrated = school?.length ?? 0
const sarkisCategories = new Set(sarkis.map(s => s.category).filter(Boolean)).size

console.log('\n── structures ──')
check('categories', categories.length, sarkisCategories + (schoolMigrated > 0 ? 1 : 0))
check('  of which life-areas', categories.filter(c => c.is_area).length, 4)
check('people', people.length, contributors.length)
check('  linked to a contributor', people.filter(p => p.contributor_id).length, contributors.length)

console.log('\n── the tree ──')
const roots = items.filter(i => !i.parent_id)
const children = items.filter(i => i.parent_id)
check('roots', roots.length >= 13, true)
check('children', children.length, sarkis.length + schoolMigrated)
check('migrated from sarkis_tasks', items.filter(i => i.legacy_sarkis_id).length, sarkis.length)
check('carrying a portal project id', items.filter(i => i.legacy_project_id).length, projects.length)

const ids = new Set(items.map(i => i.id))
check('children with a missing parent', children.filter(c => !ids.has(c.parent_id)).length, 0)
check('sarkis rows not migrated',
  sarkis.filter(s => !items.some(i => i.legacy_sarkis_id === s.id)).length, 0)

console.log('\n── merges ──')
for (const [category, project] of [['OCCM VT', 'OCCM Virginia Tech'], ['Convent', 'SMSD Convent']]) {
  const cat = categories.find(c => c.name === category)
  const root = roots.find(i => i.category_id === cat?.id)
  const proj = projects.find(p => p.name.trim() === project)
  check(`${category} root merged with "${project}"`, root?.legacy_project_id === proj?.id, true)
}

console.log('\n── Sarkis Fixes evicted ──')
const fixesCat = categories.find(c => c.name === 'Sarkis Fixes')
const fixes = items.filter(i => i.category_id === fixesCat?.id && i.parent_id)
check('items in the category', fixes.length, 7)
check('all archived', fixes.every(i => i.archived_at), true)
check('still present in sarkis_tasks',
  sarkis.filter(s => s.category === 'Sarkis Fixes').length, 7)

if (schoolMigrated > 0) {
  console.log('\n── 012 school ──')
  check('coursework migrated into items', schoolMigrated, sweat.length)
  check('School category exists', !!categories.find(c => c.name === 'School'), true)
  check('sweat_tasks left untouched', sweat.length, 2)
  const courseRoots = items.filter(
    i => !i.parent_id && i.category_id === categories.find(c => c.name === 'School')?.id,
  )
  check('a root per course', courseRoots.length > 0, true)
}

console.log('\n── backfills ──')
check('sweat rows with actual_due_date',
  sweat.filter(s => s.actual_due_date).length, sweat.filter(s => s.due_date).length)

console.log('\n── person links ──')
for (const l of links) {
  const person = people.find(p => p.id === l.person_id)
  const item = items.find(i => i.id === l.item_id)
  console.log(`  ${l.relation.padEnd(11)} ${(person?.name ?? '?').padEnd(18)} → ${item?.title.slice(0, 46)}`)
}
if (links.length === 0) console.log('  (none)')

console.log('\n── untouched by this migration ──')
check('sarkis_tasks rows', sarkis.length, 82)
check('projects rows', projects.length, 5)
check('contributors rows', contributors.length, 19)

console.log(`\n${fail === 0 ? '✅  migration 007 verified' : `❌  ${fail} check(s) failed`}\n`)
console.log('  Rollback, if the design pass changes the model:')
console.log('    drop table if exists item_people, items, people, categories cascade;\n')
process.exitCode = fail === 0 ? 0 : 1
}
