/**
 * Proves the load-bearing guarantee: a failed feed fetch throws and archives
 * nothing. Run after any change to lib/sync/exec-portal.ts.
 *   node scripts/exec-portal-failsafe.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { syncExecPortal } from '../lib/sync/exec-portal.ts'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const live = async () =>
  (await db.from('items').select('id').eq('external_source', 'exec-portal').is('archived_at', null)).data.length

const before = await live()
let threw = false
try {
  await syncExecPortal(db, { feedUrl: env.EXEC_PORTAL_FEED_URL, token: 'wrong-token' })
} catch (e) {
  threw = true
  console.log('  threw:', e.message)
}
const after = await live()
const ok = threw && before === after
console.log(`  live rows before ${before}, after ${after}`)
console.log(ok ? '\n✅  bad token throws, nothing archived\n' : '\n❌  guarantee broken\n')
process.exitCode = ok ? 0 : 1
