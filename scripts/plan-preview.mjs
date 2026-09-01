/**
 * What the planning rules would do to the coursework already synced.
 *   node scripts/plan-preview.mjs
 * Reads only. Writes nothing.
 */
import fs from 'node:fs'
import { planFor, isExam, RULES, DEFAULT_RULE } from '../lib/sync/planning.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const day = iso => DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]

const all = await (await fetch(`${U}/rest/v1/items?select=id,title,parent_id,due_date,planned_date,external_uid&limit=2000`, { headers: h })).json()
const vt = all.find(i => !i.parent_id && i.title === 'VT')
const classes = all.filter(i => i.parent_id === vt.id)

let wouldPlan = 0, exams = 0
const perDay = {}
console.log('\nclass                                  rule              plans  exams')
for (const c of classes) {
  const code = c.title.match(/^([A-Z]+ \d+)/)?.[1] ?? null
  const rule = (code && RULES[code]) || DEFAULT_RULE
  const kids = all.filter(x => x.parent_id === c.id && x.due_date)
  let p = 0, e = 0
  for (const k of kids) {
    if (isExam(k.title)) { e++; exams++; continue }
    const plan = planFor(code, k.due_date, k.title)
    if (plan) { p++; wouldPlan++; perDay[day(plan)] = (perDay[day(plan)] ?? 0) + 1 }
  }
  const label = rule.kind === 'weekday' ? `${DOW[rule.weekday]} before` : `${rule.days}d before`
  console.log(`  ${c.title.padEnd(36)} ${label.padEnd(16)} ${String(p).padStart(5)}  ${String(e).padStart(5)}`)
}

console.log(`\nwould set ${wouldPlan} planned dates; ${exams} exams left with no plan.`)
console.log('landing weekday:', JSON.stringify(perDay))
console.log('on Fri/Sat/Sun :', (perDay.Fri ?? 0) + (perDay.Sat ?? 0) + (perDay.Sun ?? 0), '(must be 0)')

console.log('\nsample:')
for (const k of all.filter(i => i.external_uid && i.due_date && !isExam(i.title)).slice(0, 8)) {
  const parent = all.find(x => x.id === k.parent_id)
  const code = parent?.title.match(/^([A-Z]+ \d+)/)?.[1] ?? null
  const plan = planFor(code, k.due_date, k.title)
  console.log(`  due ${k.due_date} ${day(k.due_date)}  ->  plan ${plan} ${day(plan)}  ${(code ?? '').padEnd(10)} ${k.title.slice(0, 40)}`)
}
console.log()
