/**
 * Run every configured portal sync once, from here.
 *   node scripts/exec-portal-sync.mjs
 * Same code the endpoint runs; this only supplies the client and the config.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { configuredPortals, syncExecPortal } from '../lib/sync/exec-portal.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const portals = configuredPortals(env)
if (portals.length === 0) {
  console.error('No portal has both its feed URL and token set in .env.local')
  process.exit(1)
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

for (const portal of portals) {
  console.log(`\n\u2500\u2500 ${portal.source} \u2500\u2500`)
  try {
    const report = await syncExecPortal(db, portal)
    for (const [k, v] of Object.entries(report)) {
      if (k === 'source') continue
      console.log(`  ${k.padEnd(20)} ${Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : v}`)
    }
  } catch (e) {
    console.log('  FAILED:', e.message)
  }
}
console.log()
