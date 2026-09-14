/**
 * Run the exec-portal sync once, from here.
 *   node scripts/exec-portal-sync.mjs
 * Same code the endpoint runs; this only supplies the client and the config.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { syncExecPortal } from '../lib/sync/exec-portal.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const feedUrl = env.EXEC_PORTAL_FEED_URL
const token = env.EXEC_PORTAL_TOKEN
if (!feedUrl || !token) {
  console.error('EXEC_PORTAL_FEED_URL and EXEC_PORTAL_TOKEN must be set in .env.local')
  process.exit(1)
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const report = await syncExecPortal(db, { feedUrl, token })
console.log('\n── exec portal sync ──')
for (const [k, v] of Object.entries(report)) {
  console.log(`  ${k.padEnd(20)} ${Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : v}`)
}
console.log()
