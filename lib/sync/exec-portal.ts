/**
 * The exec-portal sync, modelled on lib/sync/canvas.ts.
 *
 * The portal (occmvt) is the system of record for the tasks assigned to you
 * there. They land in the tree under one project so they can be planned and
 * seen beside everything else, and the ownership split is the same one Canvas
 * uses, with one deliberate difference:
 *
 *   portal owns   title, description (notes), due_date, parent, PROGRESS
 *   you own       planned_date, priority, archived_at
 *
 * Progress is source-owned here because the portal is where status is
 * decided — a task is "done" when it is done there. Ticking it off on this
 * side will be overwritten by the next sync if the portal still says open.
 * Canvas has no status of its own, which is why it is the other way round.
 *
 * A failed fetch THROWS. Treating a 401 or a 500 as "no tasks" would look
 * exactly like every task being unassigned, and the archive step below would
 * then quietly archive all of them. No feed, no sync.
 *
 * Relative import so scripts/exec-portal-sync.mjs can run this under plain
 * Node, same as the Canvas script.
 */
import { today as todayIso } from '../dates.ts'

export interface ExecPortalConfig {
  feedUrl: string
  token: string
}

interface FeedPerson { id: string; name: string }

interface FeedTask {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date: string | null
  created_by: FeedPerson | null
  assignees: FeedPerson[]
  created_at: string
  updated_at: string | null
  url: string
}

interface FeedUpdate {
  id: string
  task_id: string
  task_title: string
  author: FeedPerson | null
  note: string
  created_at: string
}

interface Feed {
  version: number
  generated_at: string
  member: { id: string; name: string; role: string; title: string }
  tasks: FeedTask[]
  team_open: FeedTask[]
  updates: FeedUpdate[]
}

export interface ExecPortalReport {
  member: string | null
  tasks: number
  created: number
  updated: number
  unchanged: number
  archived: number
  skippedArchived: number
  updatesSeen: number
  updatesStored: number
  /** True when the updates table does not exist yet (migration 019). */
  updatesTableMissing: boolean
  projectCreated: boolean
  errors: string[]
}

export const SOURCE = 'exec-portal'
/** The stable marker on the project row. Title is free to change. */
export const PROJECT_UID = 'project:root'
export const PROJECT_TITLE = 'OCCM Exec'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * The portal's four levels onto this app's three. High collapses into Soon,
 * which loses a step — but a fourth priority here would be a new concept for
 * one integration, and Soon is where "high" sits in practice.
 */
function seedPriority(p: FeedTask['priority']): string {
  if (p === 'urgent') return 'Urgent'
  if (p === 'high') return 'Soon'
  return 'Whenever'
}

function progressOf(status: FeedTask['status']): 'in_progress' | 'done' | null {
  if (status === 'done') return 'done'
  if (status === 'in_progress') return 'in_progress'
  return null
}

/** PostgREST's "no such table in the schema cache". */
const isMissingTable = (err: { code?: string } | null) =>
  err?.code === 'PGRST205' || err?.code === '42P01'

export async function fetchFeed(config: ExecPortalConfig): Promise<Feed> {
  const res = await fetch(config.feedUrl, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    // Never echo the URL or token: the token is a bearer credential.
    throw new Error(`Exec portal feed returned ${res.status}.`)
  }
  const feed = (await res.json()) as Feed
  if (!Array.isArray(feed.tasks)) throw new Error('Exec portal feed had no tasks array.')
  return feed
}

export async function syncExecPortal(
  db: Db,
  config: ExecPortalConfig,
  today: string = todayIso(),
): Promise<ExecPortalReport> {
  const feed = await fetchFeed(config)
  const errors: string[] = []

  const { data: allItems, error: readErr } = await db.from('items').select('*')
  if (readErr) throw readErr
  const items = (allItems ?? []) as {
    id: string; title: string; notes: string | null; parent_id: string | null
    due_date: string | null; archived_at: string | null; progress: string | null
    priority: string | null; link: string | null
    external_uid: string | null; external_source: string | null
  }[]

  // ── the project row, found by marker ──
  let project = items.find(
    i => i.external_source === SOURCE && i.external_uid === PROJECT_UID,
  )
  let projectCreated = false
  if (!project) {
    const { data, error } = await db
      .from('items')
      .insert({
        title: PROJECT_TITLE,
        parent_id: null,
        is_group: true,
        board: 'pinned',
        external_source: SOURCE,
        external_uid: PROJECT_UID,
        external_synced_at: new Date().toISOString(),
      })
      .select('*')
      .single()
    if (error) throw error
    project = data
    projectCreated = true
  } else if (project.archived_at) {
    // The project was archived here; its tasks would be invisible. Restore it
    // rather than filing new work into a hidden container.
    await db.from('items').update({ archived_at: null }).eq('id', project.id)
  }

  // ── tasks ──
  const mine = items.filter(
    i => i.external_source === SOURCE && i.external_uid && i.external_uid !== PROJECT_UID,
  )
  const byUid = new Map(mine.map(i => [i.external_uid!, i]))
  const seen = new Set<string>()

  let created = 0
  let updated = 0
  let unchanged = 0
  let skippedArchived = 0
  let archived = 0

  for (const task of feed.tasks) {
    seen.add(task.id)
    const existing = byUid.get(task.id)
    const notes = task.description?.trim() || null
    const progress = progressOf(task.status)

    if (!existing) {
      const { error } = await db.from('items').insert({
        title: task.title,
        notes,
        parent_id: project!.id,
        due_date: task.due_date,
        progress,
        // Seeded once, never written again: priority is yours after this.
        priority: seedPriority(task.priority),
        link: task.url ?? null,
        external_uid: task.id,
        external_source: SOURCE,
        external_synced_at: new Date().toISOString(),
      })
      if (error) throw error
      created++
      continue
    }

    // Archived here stays archived, as with Canvas.
    if (existing.archived_at) {
      skippedArchived++
      continue
    }

    const changed =
      existing.title !== task.title ||
      (existing.notes ?? null) !== notes ||
      existing.due_date !== task.due_date ||
      existing.parent_id !== project!.id ||
      (existing.progress ?? null) !== progress ||
      (existing.link ?? null) !== (task.url ?? null)

    if (!changed) {
      unchanged++
      continue
    }

    const { error } = await db
      .from('items')
      .update({
        title: task.title,
        notes,
        due_date: task.due_date,
        parent_id: project!.id,
        progress,
        link: task.url ?? null,
        external_synced_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    if (error) throw error
    updated++
  }

  /**
   * Gone from the feed means unassigned or removed on the portal. Archive by
   * explicit id — never a pattern — and only rows this source owns. This is
   * the step that makes the throw-on-failure above load-bearing.
   */
  for (const row of mine) {
    if (seen.has(row.external_uid!) || row.archived_at) continue
    const { error } = await db
      .from('items')
      .update({ archived_at: new Date().toISOString(), external_synced_at: new Date().toISOString() })
      .eq('id', row.id)
    if (error) throw error
    archived++
  }

  // ── updates, into their own table ──
  let updatesStored = 0
  let updatesTableMissing = false
  if (feed.updates.length > 0) {
    const rows = feed.updates.map(u => ({
      id: u.id,
      task_id: u.task_id,
      task_title: u.task_title,
      author_name: u.author?.name ?? null,
      note: u.note,
      created_at: u.created_at,
      synced_at: new Date().toISOString(),
    }))
    const { error } = await db
      .from('exec_portal_updates')
      .upsert(rows, { onConflict: 'id' })
    if (error) {
      if (isMissingTable(error)) {
        // Tolerated until migration 019 runs, per the PENDING_COLUMNS pattern.
        updatesTableMissing = true
      } else {
        throw error
      }
    } else {
      updatesStored = rows.length
    }
  }

  return {
    member: feed.member?.name ?? null,
    tasks: feed.tasks.length,
    created,
    updated,
    unchanged,
    archived,
    skippedArchived,
    updatesSeen: feed.updates.length,
    updatesStored,
    updatesTableMissing,
    projectCreated,
    errors,
  }
}
