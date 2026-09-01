/**
 * Parser checks against the real Canvas feed shape.
 *   node scripts/test-ics.mjs <path-to.ics>
 * Runs the fixture assertions with no argument.
 */
import fs from 'node:fs'
import * as mod from '../lib/ics.ts'

// A lone backslash, built rather than typed: a literal one in this file is
// at the mercy of whatever wrote the file, and a test that lies about its
// own input is worse than no test.
const BS = String.fromCharCode(92)

let fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)}${ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

console.log('\n── folding ──')
eq('continuation joins', mod.unfold('SUMMARY:Chapter 1\n  and more').length, 1)
eq('folded value reassembled', mod.unfold('A:one\n two')[0], 'A:onetwo')

console.log('\n── escaping ──')
eq('escaped comma', mod.unescapeText('Concussion' + BS + ', Velocity'), 'Concussion, Velocity')
eq('escaped newline', mod.unescapeText('one' + BS + 'ntwo'), 'one two')

console.log('\n── summaries ──')
eq('course extracted', mod.splitSummary('HW 1B [MSE_2034_88599_202609]'),
   { title: 'HW 1B', course: 'MSE 2034' })
eq('no brackets survives', mod.splitSummary('Read chapter 4'),
   { title: 'Read chapter 4', course: null })

console.log('\n── times ──')
const allDay = mod.parseIcs('BEGIN:VEVENT\nUID:a\nDTSTART;VALUE=DATE;VALUE=DATE:20260827\nSUMMARY:HW 1B [MSE_2034_1_2]\nEND:VEVENT')
eq('all-day date', allDay[0].date, '2026-08-27')
eq('all-day has no time', allDay[0].time, null)
const timed = mod.parseIcs('BEGIN:VEVENT\nUID:b\nDTSTART:20260828T150000Z\nSUMMARY:Quiz [ISE_3434_1_2]\nEND:VEVENT')
eq('15:00Z becomes 11:00 Eastern', timed[0].time, '11:00')
eq('and stays on the same day', timed[0].date, '2026-08-28')
// A late-evening UTC stamp lands on the previous Eastern day; that rollover is
// exactly the bug this file exists to avoid.
const rollover = mod.parseIcs('BEGIN:VEVENT\nUID:c\nDTSTART:20260829T033000Z\nSUMMARY:Late [X_1_1_1]\nEND:VEVENT')
eq('03:30Z rolls back a day in Eastern', rollover[0].date, '2026-08-28')
eq('  and reads 23:30', rollover[0].time, '23:30')

const file = process.argv[2]
if (file && fs.existsSync(file)) {
  console.log('\n── the real feed ──')
  const events = mod.parseIcs(fs.readFileSync(file, 'utf8'))
  const vevents = (fs.readFileSync(file, 'utf8').match(/BEGIN:VEVENT/g) || []).length
  eq('every VEVENT parsed', events.length, vevents)
  eq('none missing a date', events.filter(e => !/^\d{4}-\d{2}-\d{2}$/.test(e.date)).length, 0)
  eq('none missing a title', events.filter(e => !e.title).length, 0)
  eq('no stray backslashes left', events.filter(e => e.title.includes(BS)).length, 0)
  eq('sorted by date', events.map(e => e.date).join() ,
     [...events].sort((a,b)=>a.date.localeCompare(b.date)).map(e=>e.date).join())
  const courses = [...new Set(events.map(e => e.course).filter(Boolean))]
  console.log(`  courses: ${courses.join(', ')}`)
  console.log(`  window : ${events[0].date} -> ${events[events.length-1].date}`)
  console.log(`  next 5 :`)
  for (const e of mod.upcoming(events, '2026-09-01', 30).slice(0, 5)) {
    console.log(`     ${e.date} ${(e.time ?? '     ').padEnd(6)} ${(e.course ?? '').padEnd(10)} ${e.title.slice(0, 46)}`)
  }
}

console.log(`\n${fail === 0 ? '✅  ics parser verified' : `❌  ${fail} failed`}\n`)
process.exitCode = fail === 0 ? 0 : 1
