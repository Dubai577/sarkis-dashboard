/**
 * What the Canvas sync would do, without doing it.
 *   node scripts/canvas-dryrun.mjs
 * Reads the feeds and the live tree. Writes nothing.
 */
import fs from 'node:fs'
import { parseIcs, upcoming } from '../lib/ics.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const U = env.NEXT_PUBLIC_SUPABASE_URL
const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const today = new Date().toISOString().slice(0, 10)
const norm = t => t.replace(/\s+/g, ' ').trim().toUpperCase()

const feeds = (env.CANVAS_ICS_URL ?? '').split(',').map(s => s.trim()).filter(Boolean)
const events = []
for (const url of feeds) {
  const res = await fetch(url, { headers: { Accept: 'text/calendar' } })
  if (!res.ok) { console.log(`  feed failed: ${res.status}`); continue }
  events.push(...parseIcs(await res.text()))
}
const window = upcoming(events, today, 120)

const items = await (await fetch(`${U}/rest/v1/items?select=id,title,parent_id,archived_at`, { headers: h })).json()
const vt = items.find(i => !i.parent_id && norm(i.title) === 'VT' && !i.archived_at)

console.log(`\nfeeds        ${feeds.length}`)
console.log(`events       ${events.length} parsed, ${window.length} inside the 120-day window`)
console.log(`VT root      ${vt ? vt.id : 'NOT FOUND — sync would refuse'}`)

const byCourse = new Map()
for (const e of window) {
  const k = e.course ?? '(no course code)'
  byCourse.set(k, (byCourse.get(k) ?? 0) + 1)
}

console.log('\ncourse      would file under                          items')
for (const [code, n] of [...byCourse].sort()) {
  const match = items.find(i => i.parent_id === vt?.id && !i.archived_at && norm(i.title).startsWith(norm(code)))
  console.log(`  ${code.padEnd(10)} ${(match ? match.title : `** would CREATE "${code}" **`).padEnd(40)} ${String(n).padStart(3)}`)
}

console.log(`\nall ${window.length} become tasks with a DUE date, none with a planned date.`)
console.log(`re-runs match on the feed UID, so this count does not double.\n`)
const soon = window.slice(0, 6)
console.log('first few:')
for (const e of soon) console.log(`  due ${e.date}  ${(e.course ?? '').padEnd(10)} ${e.title.slice(0, 52)}`)
console.log()
