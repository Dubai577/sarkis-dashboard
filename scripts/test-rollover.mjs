/**
 * Rollover logic, tested against an in-memory model with an injected clock.
 *
 *   node scripts/test-rollover.mjs
 *
 * The real runRollover talks to the database. This mirrors its decision rules
 * exactly so the behaviour that matters — one day at a time, stopping at
 * Sunday, protecting future manual placements, merging rather than duplicating
 * — is asserted without needing a live database or waiting for real days.
 */

import { addDays, dayIndex, weekStart } from '../lib/dates.ts'

let pass = 0, fail = 0
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  const ok = a === e
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)} ${a}${ok ? '' : `  expected ${e}`}`)
}

function equivalenceKey(row) {
  const title = row.title.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${row.task_date}|${row.source_item_id ?? row.source_sweat_id ?? 'own'}|${title}`
}

/** Mirrors lib/db/rollover.ts. */
function simulate(todos, lastRolledThrough, now) {
  const rows = todos.map(t => ({ roll_count: 0, placement: 'auto', source_item_id: null, source_sweat_id: null, ...t }))
  const start = lastRolledThrough ?? addDays(now, -1)
  const result = { moved: 0, merged: 0, skipped: 0, days: 0 }
  if (start >= now) return { rows, result }

  for (let day = addDays(start, 1); day <= now; day = addDays(day, 1)) {
    result.days++
    if (dayIndex(day) === 0) continue          // Monday: nothing crosses the week

    const source = addDays(day, -1)
    const movable = rows.filter(r => r.task_date === source && !r.is_complete)
    const occupied = new Map(
      rows.filter(r => r.task_date === day && !r.is_complete).map(r => [equivalenceKey(r), r]),
    )

    for (const row of movable) {
      if (row.placement === 'manual' && row.task_date > now) { result.skipped++; continue }

      const key = equivalenceKey({ ...row, task_date: day })
      const clash = occupied.get(key)
      if (clash) {
        clash.roll_count = Math.max(clash.roll_count, row.roll_count + 1)
        row.deleted = true
        result.merged++
        continue
      }
      row.origin_date = row.origin_date ?? row.task_date
      row.task_date = day
      row.roll_count += 1
      row.placement = 'auto'
      occupied.set(key, row)
      result.moved++
    }
  }
  return { rows: rows.filter(r => !r.deleted), result }
}

// 2026-08-10 Mon … 2026-08-16 Sun
console.log('\n── one day at a time, across a multi-day gap ──')
{
  const { rows, result } = simulate(
    [{ id: 'a', title: 'follow up', task_date: '2026-08-10', is_complete: false }],
    '2026-08-10', '2026-08-14',
  )
  check('walked four days', result.days, 4)
  check('landed on Friday, not jumped', rows[0].task_date, '2026-08-14')
  check('roll_count reflects each hop', rows[0].roll_count, 4)
  check('origin_date keeps the first date', rows[0].origin_date, '2026-08-10')
}

console.log('\n── stops at Sunday, becomes overdue instead ──')
{
  const { rows } = simulate(
    [{ id: 'a', title: 'x', task_date: '2026-08-16', is_complete: false }],  // Sunday
    '2026-08-16', '2026-08-18',                                              // into Tuesday
  )
  check('did not cross into the new week', rows[0].task_date, '2026-08-16')
  check('week is still the previous one', weekStart(rows[0].task_date), '2026-08-10')
  check('so it is now overdue', weekStart(rows[0].task_date) < weekStart('2026-08-18'), true)
}

console.log('\n── manual placement ──')
{
  // Future manual placement: the walk never reaches it.
  const { rows } = simulate(
    [{ id: 'a', title: 'dentist', task_date: '2026-08-20', is_complete: false, placement: 'manual' }],
    '2026-08-11', '2026-08-13',
  )
  check('future manual placement untouched', rows[0].task_date, '2026-08-20')
  check('roll_count still zero', rows[0].roll_count, 0)
}
{
  // Past manual placement walks, so it cannot vanish from a day view.
  const { rows } = simulate(
    [{ id: 'a', title: 'call', task_date: '2026-08-11', is_complete: false, placement: 'manual' }],
    '2026-08-11', '2026-08-13',
  )
  check('past manual placement walks', rows[0].task_date, '2026-08-13')
  check('and is no longer marked manual', rows[0].placement, 'auto')
}

console.log('\n── completed tasks never move ──')
{
  const { rows } = simulate(
    [{ id: 'a', title: 'done thing', task_date: '2026-08-11', is_complete: true }],
    '2026-08-11', '2026-08-13',
  )
  check('stayed put', rows[0].task_date, '2026-08-11')
}

console.log('\n── idempotency ──')
{
  const first = simulate(
    [{ id: 'a', title: 'x', task_date: '2026-08-11', is_complete: false }],
    '2026-08-11', '2026-08-12',
  )
  const second = simulate(first.rows, '2026-08-12', '2026-08-12')
  check('first run moved it', first.result.moved, 1)
  check('second run is a no-op', second.result.moved, 0)
  check('and did not move it again', second.rows[0].task_date, '2026-08-12')
}

console.log('\n── merge rather than duplicate ──')
{
  const { rows, result } = simulate(
    [
      { id: 'a', title: 'Follow up', task_date: '2026-08-11', is_complete: false, roll_count: 2 },
      { id: 'b', title: 'follow  up', task_date: '2026-08-12', is_complete: false },
    ],
    '2026-08-11', '2026-08-12',
  )
  check('merged, not duplicated', rows.length, 1)
  check('kept the row already on the day', rows[0].id, 'b')
  check('kept the higher roll_count', rows[0].roll_count, 3)
  check('counted as a merge', result.merged, 1)
}
{
  // Same title, different sources, must NOT merge — two projects can each
  // legitimately have a child called "follow up".
  const { rows } = simulate(
    [
      { id: 'a', title: 'follow up', task_date: '2026-08-11', is_complete: false, source_item_id: 'i1' },
      { id: 'b', title: 'follow up', task_date: '2026-08-12', is_complete: false, source_item_id: 'i2' },
    ],
    '2026-08-11', '2026-08-12',
  )
  check('different sources stay separate', rows.length, 2)
}

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`)
process.exitCode = fail === 0 ? 0 : 1
