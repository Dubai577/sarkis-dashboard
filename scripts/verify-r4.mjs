/**
 * Verifies migrations 008, 009 and 010.
 *
 *   node scripts/verify-r4.mjs
 *
 * Read-only except for one scheduling probe, which inserts a row, asserts the
 * partial unique index rejects a duplicate, and deletes both. Every probe
 * distinguishes "the constraint refused this" from "my payload was malformed" —
 * an earlier verifier reported PASS on schema errors, which is a false pass.
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const svc = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const anon = { apikey: ANON, Authorization: `Bearer ${ANON}` }

let fail = 0
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  if (!ok) fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(48)} ${actual}${ok ? '' : `   expected ${expected}`}`)
}

const get = async (p, headers = svc) => {
  const res = await fetch(`${URL}/rest/v1/${p}`, { headers })
  return res.ok ? res.json() : null
}

// ── 008 routines ─────────────────────────────────────────────────

console.log('\n── 008 routines ──')
const routines = await get('routines?select=*&order=sort_order')
if (!routines) {
  console.log('  FAIL  routines table missing — migration 008 not applied')
  fail++
} else {
  check('routines', routines.length, 7)
  check('  daily', routines.filter(r => r.cadence === 'daily').length, 5)
  check('  alternating', routines.filter(r => r.cadence === 'alternating').length, 1)
  check('  weekly_on', routines.filter(r => r.cadence === 'weekly_on').length, 1)
  const weekly = routines.find(r => r.cadence === 'weekly_on')
  check('  Wednesday-only routine is weekday 2', weekly?.weekday, 2)
  const alt = routines.find(r => r.cadence === 'alternating')
  check('  alternating has an anchor date', !!alt?.anchor_date, true)

  const checksTable = await get('routine_checks?select=*&limit=1')
  check('routine_checks readable', checksTable !== null, true)

  const anonRoutines = await get('routines?select=id', anon)
  check('anon cannot read routines', anonRoutines === null || anonRoutines.length === 0, true)
}

// ── 009 scheduling ───────────────────────────────────────────────

console.log('\n── 009 scheduling ──')
const todo = (await get('todos?select=*&limit=1'))?.[0]
if (!todo) {
  console.log('  (no todos to inspect)')
} else {
  for (const column of ['placement', 'origin_date', 'roll_count', 'source_item_id', 'source_sweat_id']) {
    check(`todos.${column} exists`, column in todo, true)
  }
}

const state = await get('rollover_state?select=*')
check('rollover_state singleton', state?.length, 1)
const log = await get('rollover_log?select=id&limit=1')
check('rollover_log readable', log !== null, true)

// The partial unique index: one materialized row per source while incomplete.
console.log('\n── 009 partial unique index ──')
const anItem = (await get('items?select=id&limit=1'))?.[0]
if (!anItem) {
  console.log('  (no items — skipped)')
} else {
  const insert = body =>
    fetch(`${URL}/rest/v1/todos`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify(body),
    })

  const first = await insert({
    title: '__r4_probe__', task_date: '2030-01-07', source_item_id: anItem.id,
  })

  if (first.status !== 201) {
    const detail = await first.text()
    console.log(`  FAIL  probe insert rejected (${first.status}) — the probe is broken, not the index`)
    console.log(`        ${detail.slice(0, 150)}`)
    fail++
  } else {
    const created = (await first.json())[0]

    const second = await insert({
      title: '__r4_probe_dup__', task_date: '2030-01-08', source_item_id: anItem.id,
    })
    const body = await second.text()
    const isUnique = second.status === 409 || body.includes('23505')

    check('second open row for same source refused', isUnique, true)
    if (!isUnique) console.log(`        got ${second.status}: ${body.slice(0, 120)}`)

    // Completing the first must free the source for a new row.
    await fetch(`${URL}/rest/v1/todos?id=eq.${created.id}`, {
      method: 'PATCH', headers: svc, body: JSON.stringify({ is_complete: true }),
    })
    const third = await insert({
      title: '__r4_probe_after__', task_date: '2030-01-09', source_item_id: anItem.id,
    })
    check('allowed again once the first is complete', third.status, 201)

    await fetch(`${URL}/rest/v1/todos?title=like.__r4_probe*`, { method: 'DELETE', headers: svc })
    const leftover = await get('todos?select=id&title=like.__r4_probe*')
    check('probe rows cleaned up', leftover?.length ?? 0, 0)
  }
}

// ── 010 reminders and notifications ──────────────────────────────

console.log('\n── 010 reminders and notifications ──')
const reminders = await get('reminders?select=id&limit=1')
check('reminders table exists', reminders !== null, true)

const anonReminders = await get('reminders?select=id', anon)
check('anon cannot read reminders', anonReminders === null || anonReminders.length === 0, true)

const completed = await get('subtask_assignments?select=id&status=eq.completed')
const notifications = await get('admin_notifications?select=id&subtask_assignment_id=not.is.null')
check('a notification per completed subtask', notifications?.length ?? 0, completed?.length ?? 0)

console.log(`\n${fail === 0 ? '✅  migrations 008–010 verified' : `❌  ${fail} check(s) failed`}\n`)
process.exitCode = fail === 0 ? 0 : 1
