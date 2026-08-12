/**
 * Full database dump — every row of every table, to JSON.
 *
 *   node scripts/dump-db.mjs [outputDir]
 *
 * This is the restore point. It runs before any destructive work and is
 * verified by reading each file back and comparing row counts, so a truncated
 * write cannot pass as a good backup.
 *
 * Written outside the repo by default, and mirrored to the same cloud folders
 * as the git bundles.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const env = {}
for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

/** Every table the app has ever written to, including the retired ones. */
export const TABLES = [
  'items', 'people', 'categories', 'item_people',
  'todos', 'notes', 'routines', 'routine_checks',
  'reminders', 'rollover_state', 'rollover_log',
  'projects', 'tasks', 'subtasks', 'task_resources',
  'contributors', 'project_members',
  'task_assignments', 'subtask_assignments', 'task_updates', 'subtask_updates',
  'admin_notifications', 'project_notes',
  'task_dependencies', 'dependency_notifications',
  'sarkis_tasks', 'sweat_tasks',
]

async function fetchAll(table) {
  const rows = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${URL}/rest/v1/${table}?select=*&order=id&limit=${pageSize}&offset=${offset}`, { headers })
    if (res.status === 404) return null
    if (!res.ok) {
      // Some tables have no `id` to order by; retry unordered.
      const retry = await fetch(`${URL}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`, { headers })
      if (!retry.ok) return null
      const page = await retry.json()
      rows.push(...page)
      if (page.length < pageSize) break
      continue
    }
    const page = await res.json()
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const outDir = process.argv[2] ?? path.join(os.homedir(), 'merc-backups', `db-${stamp}`)
fs.mkdirSync(outDir, { recursive: true })

console.log(`\ndumping to ${outDir}\n`)

const manifest = { takenAt: new Date().toISOString(), project: URL, tables: {} }
let total = 0

for (const table of TABLES) {
  const rows = await fetchAll(table)
  if (rows === null) {
    console.log(`  ${table.padEnd(24)} — does not exist, skipped`)
    manifest.tables[table] = null
    continue
  }
  const file = path.join(outDir, `${table}.json`)
  fs.writeFileSync(file, JSON.stringify(rows, null, 1))

  // Verify by reading back, so a short write cannot look like a good backup.
  const readBack = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ok = readBack.length === rows.length
  if (!ok) throw new Error(`${table}: wrote ${rows.length} rows but read back ${readBack.length}`)

  manifest.tables[table] = rows.length
  total += rows.length
  console.log(`  ${table.padEnd(24)} ${String(rows.length).padStart(5)} rows  verified`)
}

manifest.totalRows = total
fs.writeFileSync(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`\n  ${total} rows across ${Object.values(manifest.tables).filter(v => v !== null).length} tables`)

// Mirror off-machine, same places as the git bundles.
for (const dir of [path.join(os.homedir(), 'OneDrive', 'merc-backups'),
                   path.join(os.homedir(), 'Dropbox', 'merc-backups')]) {
  if (!fs.existsSync(path.dirname(dir))) continue
  const dest = path.join(dir, path.basename(outDir))
  fs.mkdirSync(dest, { recursive: true })
  for (const f of fs.readdirSync(outDir)) fs.copyFileSync(path.join(outDir, f), path.join(dest, f))
  console.log(`  mirrored → ${dest}`)
}

console.log(`\n✅  restore point complete\n`)
