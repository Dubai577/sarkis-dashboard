/**
 * Run the Canvas sync once, from here.
 *   node scripts/canvas-sync.mjs
 *
 * Same code the endpoint runs — this only supplies the client, the feeds and
 * today, so a first run cannot behave differently from every later one.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { syncCanvas } from '../lib/sync/canvas.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const feeds = (env.CANVAS_ICS_URL ?? '').split(',').map(s => s.trim()).filter(Boolean)
const today = new Date().toISOString().slice(0, 10)

const report = await syncCanvas(db, feeds, today)
console.log('\n── canvas sync ──')
for (const [k, v] of Object.entries(report)) {
  console.log(`  ${k.padEnd(16)} ${Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : v}`)
}
console.log()
