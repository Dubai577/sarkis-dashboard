/**
 * Release 0 verification — proves the publishable (anon) key is inert.
 *
 *   node scripts/verify-rls.mjs
 *
 * Reads .env.local. Attempts a direct REST read AND write against every
 * personal table plus the project_summary view, using only the key that
 * ships in the browser bundle. Every one must fail.
 *
 * Run it before and after applying supabase/004_release0_rls.sql.
 */

import fs from 'node:fs'
import path from 'node:path'

const env = {}
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const URL  = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL || !ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// A valid payload per table. A schema error (400) would otherwise look like a
// pass, hiding the fact that the write was never actually refused.
const TABLES = [
  // task_date only: week_start and day_of_week became generated columns in
  // migration 006 and reject writes, which would look like a refusal.
  { name: 'todos',        row: { title: '__rls_probe__', task_date: '2020-01-06' } },
  { name: 'sarkis_tasks', row: { title: '__rls_probe__' } },
  { name: 'sweat_tasks',  row: { title: '__rls_probe__', course: '__rls_probe__', due_date: '2020-01-06' } },
  { name: 'notes',        row: { content: '__rls_probe__' } },
]
const VIEWS = ['project_summary']

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` }

async function read(relation) {
  const res = await fetch(`${URL}/rest/v1/${relation}?select=*`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  })
  if (res.status !== 200 && res.status !== 206) return { blocked: true, detail: `HTTP ${res.status}` }
  const total = (res.headers.get('content-range') || '').split('/')[1]
  return { blocked: total === '0', detail: `${total} rows readable` }
}

async function write(table, row) {
  const res = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (res.status === 201) {
    const rows = await res.json().catch(() => [])
    return { blocked: false, detail: 'INSERT ACCEPTED', ids: rows.map(r => r.id) }
  }
  // 400 means the payload was wrong, not that the write was refused — that is a
  // broken probe, not a passing check.
  if (res.status === 400) {
    const body = await res.text()
    return { blocked: false, broken: true, detail: `probe payload rejected: ${body.slice(0, 60)}` }
  }
  return { blocked: true, detail: `HTTP ${res.status}` }
}

let failures = 0
const mark = ok => (ok ? 'PASS' : 'FAIL')

console.log(`\nanon key: ${ANON.slice(0, 14)}…   project: ${URL}\n`)
console.log('relation            operation   result                       verdict')
console.log('─'.repeat(76))

for (const { name, row } of TABLES) {
  const r = await read(name)
  if (!r.blocked) failures++
  console.log(`${name.padEnd(20)}${'read'.padEnd(12)}${r.detail.padEnd(29)}${mark(r.blocked)}`)

  const w = await write(name, row)
  if (!w.blocked) failures++
  console.log(`${''.padEnd(20)}${'write'.padEnd(12)}${w.detail.padEnd(29)}${w.broken ? 'BROKEN PROBE' : mark(w.blocked)}`)
  if (w.ids?.length) console.log(`  ⚠ inserted rows still present: ${w.ids.join(', ')} — delete them`)
}

for (const view of VIEWS) {
  const r = await read(view)
  if (!r.blocked) failures++
  console.log(`${view.padEnd(20)}${'read'.padEnd(12)}${r.detail.padEnd(29)}${mark(r.blocked)}`)
}

console.log('─'.repeat(76))
if (failures === 0) {
  console.log('\n✅ The anon key is inert. Nothing readable, nothing writable.\n')
} else {
  console.log(`\n❌ ${failures} check(s) failed — the anon key still has access.`)
  console.log('   Apply supabase/004_release0_rls.sql in the Supabase SQL Editor, then re-run.\n')
  process.exitCode = 1
}
