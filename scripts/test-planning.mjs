/**
 * The planning rules, checked case by case.
 *   node scripts/test-planning.mjs
 */
import { planFor, isExam } from '../lib/sync/planning.ts'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const day = iso => DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]

let fail = 0
const eq = (label, got, want) => {
  const ok = String(got) === String(want)
  if (!ok) fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(56)}${ok ? '' : `got ${got} want ${want}`}`)
}

console.log('\n── exams are left alone ──')
eq('Exam 1', isExam('Exam 1'), true)
eq('Test 1, Chapters 1 - 3', isExam('Test 1, Chapters 1 - 3'), true)
eq('Chapter 28: Final Exam', isExam('Chapter 28: Final Exam'), true)
// The one a naive /test/ would wrongly skip.
eq('Chapter 8: Crash Test Dummies is NOT an exam', isExam('Chapter 8: Crash Test Dummies'), false)
eq('exam gets no planned date', planFor('BMES 2004', '2026-10-01', 'Exam 1'), null)

console.log('\n── BMES: the Wednesday before a Friday deadline ──')
for (const due of ['2026-09-04', '2026-09-11', '2026-09-18']) {
  const p = planFor('BMES 3004', due, 'Chapter 1')
  eq(`due ${due} ${day(due)} -> ${p} ${day(p)}`, day(p), 'Wed')
  eq(`  and two days earlier`, p, new Date(Date.parse(`${due}T12:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10))
}

console.log('\n── App Opt: one day, but never into the weekend ──')
eq('Fri deadline -> Thu', day(planFor('ISE 3434', '2026-09-04', 'HW')), 'Thu')
eq('Mon deadline -> Thu (Sun is banned)', day(planFor('ISE 3434', '2026-09-07', 'HW')), 'Thu')

console.log('\n── Statics: three days ──')
eq('Sun deadline -> Thu, as asked', day(planFor('EGR 240', '2026-09-06', 'Sect 2.3')), 'Thu')
eq('Fri deadline -> Tue', day(planFor('EGR 240', '2026-09-04', 'Sect 2.3')), 'Tue')
eq('Thu deadline -> Mon', day(planFor('EGR 240', '2026-09-10', 'Sect 2.3')), 'Mon')
eq('Sat deadline -> Wed', day(planFor('EGR 240', '2026-09-05', 'Sect 2.3')), 'Wed')
// -3 lands on Saturday; the weekend guard has to walk it back to Thursday.
eq('Tue deadline -> Thu (would be Sat)', day(planFor('EGR 240', '2026-09-08', 'Sect 2.3')), 'Thu')
eq('Mon deadline -> Thu (would be Fri)', day(planFor('EGR 240', '2026-09-07', 'Sect 2.3')), 'Thu')

console.log('\n── the rule that beats every rule ──')
const everyDay = []
for (let d = 1; d <= 28; d++) {
  const due = `2026-09-${String(d).padStart(2, '0')}`
  for (const course of ['BMES 2004', 'ISE 3434', 'EGR 240', 'MSE 2034', 'ISE 4644', null]) {
    const p = planFor(course, due, 'Assignment')
    if (p) everyDay.push({ course, due, p, d: day(p) })
  }
}
eq('nothing planned on Fri/Sat/Sun', everyDay.filter(x => ['Fri', 'Sat', 'Sun'].includes(x.d)).length, 0)
eq('nothing planned on or after its due date', everyDay.filter(x => x.p >= x.due).length, 0)
eq('(cases checked)', everyDay.length >= 150, true)
console.log(`  ${everyDay.length} course/deadline combinations swept`)

console.log('\n── Elem of Mat Eng: the Monday before ──')
for (const due of ['2026-09-10', '2026-09-08', '2026-09-09', '2026-09-04']) {
  const p = planFor('MSE 2034', due, 'HW')
  eq(`due ${due} ${day(due)} -> ${p} ${day(p)}`, day(p), 'Mon')
  eq('  and strictly before the deadline', p < due, true)
}

console.log('\n── unlisted classes fall back to two days ──')
eq('ISE 4644 Thu deadline -> Tue', day(planFor('ISE 4644', '2026-09-10', 'HW')), 'Tue')
eq('ISE 4644 Tue deadline -> Sun becomes Thu', day(planFor('ISE 4644', '2026-09-08', 'HW')), 'Thu')

console.log('\n── the buffer is never zero ──')
// Every class against every weekday of a full year: a plan must exist, must
// land before its deadline, and must never equal it.
const sweep = []
for (let i = 0; i < 365; i++) {
  const d = new Date(Date.UTC(2026, 7, 15) + i * 86400000).toISOString().slice(0, 10)
  for (const c of ['BMES 2004', 'BMES 3004', 'BMES 3224', 'MSE 2034', 'ISE 3434', 'EGR 240', 'ISE 4644', null]) {
    sweep.push({ c, due: d, p: planFor(c, d, 'Assignment') })
  }
}
eq('every assignment gets a plan', sweep.filter(x => x.p === null).length, 0)
eq('no plan equals its due date', sweep.filter(x => x.p === x.due).length, 0)
eq('no plan is after its due date', sweep.filter(x => x.p > x.due).length, 0)
eq('no plan on Fri/Sat/Sun', sweep.filter(x => ['Fri', 'Sat', 'Sun'].includes(day(x.p))).length, 0)
console.log(`  ${sweep.length} class/deadline pairs swept across a full year`)

console.log(`\n${fail === 0 ? '✅  planning rules verified' : `❌  ${fail} failed`}\n`)
process.exitCode = fail === 0 ? 0 : 1
