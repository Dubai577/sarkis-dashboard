/**
 * Date module tests. Uses injected instants rather than the wall clock, so the
 * 9 PM Eastern case is checked without waiting until 9 PM.
 *
 *   node scripts/test-dates.mjs
 */
import {
  today, easternHour, addDays, dayIndex, dayName, weekStart,
  currentWeekStart, dateForDay, shiftWeeks, isMonday, shortLabel,
} from '../lib/dates.ts'

let pass = 0, fail = 0
const check = (label, actual, expected) => {
  const ok = actual === expected
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(58)} ${actual}${ok ? '' : `   expected ${expected}`}`)
}

// The exact instant that corrupted row 81d76f58: 9:14 PM Eastern on Wed 27 May.
const theBug = new Date('2026-05-28T01:14:26.140Z')

console.log('\n── the bug: 9:14 PM Eastern, after UTC has rolled over ──')
check('Eastern calendar date', today(theBug), '2026-05-27')
check('Eastern hour (21 = 9 PM)', String(easternHour(theBug)), '21')
check('week start (Monday, not Tuesday)', currentWeekStart(theBug), '2026-05-25')
check('naive UTC would have given', new Date(theBug).toISOString().slice(0, 10), '2026-05-28')

console.log('\n── late evening across the year (EDT and EST) ──')
for (const [instant, expected, label] of [
  ['2026-08-11T23:59:00Z', '2026-08-11', '7:59 PM EDT — same day'],
  ['2026-08-12T03:59:00Z', '2026-08-11', '11:59 PM EDT — still the 11th'],
  ['2026-08-12T04:01:00Z', '2026-08-12', '12:01 AM EDT — now the 12th'],
  ['2026-01-15T04:59:00Z', '2026-01-14', '11:59 PM EST — still the 14th'],
  ['2026-01-15T05:01:00Z', '2026-01-15', '12:01 AM EST — now the 15th'],
]) check(label, today(new Date(instant)), expected)

console.log('\n── DST boundaries ──')
// 2026: DST starts Sun 8 Mar, ends Sun 1 Nov.
check('7 AM ET on spring-forward day = 11:00 UTC', String(easternHour(new Date('2026-03-08T11:00:00Z'))), '7')
check('7 AM ET the day before   = 12:00 UTC', String(easternHour(new Date('2026-03-07T12:00:00Z'))), '7')
check('7 AM ET on fall-back day = 12:00 UTC', String(easternHour(new Date('2026-11-01T12:00:00Z'))), '7')
check('spring-forward: day after 3/7', addDays('2026-03-07', 1), '2026-03-08')
check('fall-back: day after 10/31', addDays('2026-10-31', 1), '2026-11-01')
check('week spanning spring-forward', weekStart('2026-03-12'), '2026-03-09')

console.log('\n── week arithmetic ──')
check('Monday maps to itself', weekStart('2026-08-10'), '2026-08-10')
check('Tuesday maps back', weekStart('2026-08-11'), '2026-08-10')
check('Sunday maps back (not forward)', weekStart('2026-08-16'), '2026-08-10')
check('next Monday', weekStart('2026-08-17'), '2026-08-17')
check('dayIndex Monday = 0', String(dayIndex('2026-08-10')), '0')
check('dayIndex Sunday = 6', String(dayIndex('2026-08-16')), '6')
check('dayName', dayName('2026-08-11'), 'Tuesday')
check('dateForDay Friday', dateForDay('2026-08-10', 'Friday'), '2026-08-14')
check('dateForDay Sunday', dateForDay('2026-08-10', 'Sunday'), '2026-08-16')
check('shiftWeeks +3', shiftWeeks('2026-08-10', 3), '2026-08-31')
check('shiftWeeks -1', shiftWeeks('2026-08-10', -1), '2026-08-03')
check('isMonday true', String(isMonday('2026-08-10')), 'true')
check('isMonday false', String(isMonday('2026-05-26')), 'false')
check('shortLabel', shortLabel('2026-08-11'), '8/11')

console.log('\n── every week_start the repair will produce is a Monday ──')
for (const d of ['2026-05-11', '2026-05-25', '2026-06-01', '2026-06-15'])
  check(`${d} is a Monday`, String(isMonday(d)), 'true')

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} passed, ${fail} failed\n`)
process.exitCode = fail === 0 ? 0 : 1
