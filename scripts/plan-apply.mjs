/**
 * Apply the planning rules to coursework already synced.
 *   node scripts/plan-apply.mjs [--dry]
 *
 * Only touches rows the app owns: a planned date it derived (planned_auto), or
 * none at all. Anything you set by hand is left alone.
 */
import fs from 'node:fs'
import { planFor, isExam } from '../lib/sync/planning.ts'

const dry = process.argv.includes('--dry')
const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const h = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}

const all = await (await fetch(`${U}/rest/v1/items?select=id,title,parent_id,due_date,planned_date,planned_auto,external_source&limit=2000`, { headers: h })).json()
const byId = new Map(all.map(i => [i.id, i]))
const courseOf = i => byId.get(i.parent_id)?.title.match(/^([A-Z]+ \d+)/)?.[1] ?? null

// planned_auto may not exist yet; sending it then would fail the whole write.
const hasAuto = all.length > 0 && 'planned_auto' in all[0]
console.log(`planned_auto column: ${hasAuto ? 'present' : 'NOT YET — migration 018 will claim these'}`)

let set = 0, skippedYours = 0, skippedExam = 0, already = 0, failed = 0
for (const i of all) {
  if (i.external_source !== 'canvas' || !i.due_date) continue
  if (isExam(i.title)) { skippedExam++; continue }
  const ownsIt = i.planned_date === null || i.planned_auto === true
  if (!ownsIt) { skippedYours++; continue }

  const plan = planFor(courseOf(i), i.due_date, i.title)
  if (!plan || plan === i.planned_date) { already++; continue }
  if (dry) { set++; continue }

  const body = hasAuto ? { planned_date: plan, planned_auto: true } : { planned_date: plan }
  const res = await fetch(`${U}/rest/v1/items?id=eq.${i.id}`, {
    method: 'PATCH', headers: h, body: JSON.stringify(body),
  })
  if (res.ok) set++
  else { failed++; if (failed <= 2) console.log('  failed:', res.status, await res.text()) }
}

console.log(`\n${dry ? 'would set' : 'set'}      ${set}`)
console.log(`already right ${already}`)
console.log(`exams left    ${skippedExam}`)
console.log(`yours, kept   ${skippedYours}`)
console.log(`failed        ${failed}\n`)
