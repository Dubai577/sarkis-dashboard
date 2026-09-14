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
import { today as todayIso, addDays } from '../dates.ts'

export interface ExecPortalConfig {
  feedUrl: string
  token: string
  /** Which portal. Defaults to the first one this was built for. */
  source?: string
  /** The project row's title on first creation. */
  title?: string
}

/**
 * Every portal that speaks this feed format. Adding a club is one line here
 * and two env vars. The first entry keeps its unprefixed markers for
 * compatibility with rows that already exist; every later one prefixes its
 * markers with its source, because external_uid is unique across ALL sources
 * and two portals cannot both own 'project:root'.
 */
export const PORTALS = [
  { source: 'exec-portal', title: 'OCCM Exec', urlEnv: 'EXEC_PORTAL_FEED_URL', tokenEnv: 'EXEC_PORTAL_TOKEN' },
  { source: 'h4hvt',       title: 'H4HVT',     urlEnv: 'H4HVT_FEED_URL',       tokenEnv: 'H4HVT_TOKEN' },
] as const

export const PORTAL_SOURCES = new Set<string>(PORTALS.map(p => p.source))

/** The portals with both env vars present. */
export function configuredPortals(env: Record<string, string | undefined>): ExecPortalConfig[] {
  return PORTALS.flatMap(p => {
    const feedUrl = env[p.urlEnv]
    const token = env[p.tokenEnv]
    return feedUrl && token ? [{ feedUrl, token, source: p.source, title: p.title }] : []
  })
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
  /** Assigned to me. A subset of all_tasks; used only to flag mine. */
  tasks: FeedTask[]
  team_open: FeedTask[]
  /** Every task on the board, with assignees. This is what syncs. */
  all_tasks: FeedTask[]
  updates: FeedUpdate[]
}

export interface ExecPortalReport {
  source: string
  member: string | null
  tasks: number
  mine: number
  assignees: string[]
  groupsCreated: string[]
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
export const PROJECT_TITLE = 'OCCM Exec'

/**
 * Marker uids, per source. The original portal's are bare ('project:root',
 * 'assignee:me'); any other portal's are prefixed ('h4hvt:project:root') so
 * they cannot collide in the one unique index that spans every source.
 */
export function markers(source: string) {
  const prefix = source === SOURCE ? '' : `${source}:`
  return {
    project: `${prefix}project:root`,
    /**
     * Your own group. A fixed marker rather than assignee:<your id>, so the
     * dashboard and the evening email can tell "mine" from "someone else's"
     * without knowing who you are on that portal.
     */
    me: `${prefix}assignee:me`,
    assignee: (id: string) => `${prefix}assignee:${id}`,
  }
}
export const PROJECT_UID = markers(SOURCE).project
export const ME_UID = markers(SOURCE).me

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * Whether an exec-portal row belongs to someone else.
 *
 * The board shows the whole team so you can see who has what. But a
 * teammate's deadline is not YOUR deadline: it must not land on your Today,
 * your week, or in the 8pm email. One definition, used everywhere that
 * decides what is yours: an exec-portal task whose parent group is not yours.
 */
/**
 * What a teammate's deadline means to you: a follow-up, the day before.
 *
 * You are the VP. "Organize Bible Study days, due Friday, assigned to Freddy"
 * is not your task, but "check in with Freddy on Thursday" is. So a foreign
 * task with a due date becomes a follow-up dated the day before it is owed.
 * Once that day has passed and the task is still open on the portal, the
 * follow-up sits on today and keeps sitting there — a nag is the point.
 *
 * Done on the portal means gone from here; the sync carries status across.
 */
export interface FollowUp {
  person: string
  /** The day the follow-up shows: due - 1, or today if that has passed. */
  date: string
  /** True when the task itself is already past due. */
  overdue: boolean
  title: string
}

export function followUpFor(
  row: {
    title: string; due_date?: string | null; progress?: string | null
    external_source?: string | null; parent_id?: string | null
  },
  byId: Map<string, { title: string; external_uid?: string | null }>,
  today: string,
): FollowUp | null {
  if (!isForeign(row, byId)) return null
  if (!row.due_date || row.progress === 'done') return null
  const parent = row.parent_id ? byId.get(row.parent_id) : undefined
  const person = (parent?.title ?? 'them').replace(/\s*\(me\)$/, '')
  const dayBefore = addDays(row.due_date, -1)
  const date = dayBefore < today ? today : dayBefore
  return {
    person,
    date,
    overdue: row.due_date < today,
    title: `Follow up with ${person} about ${row.title}`,
  }
}

export function isForeign(
  row: { external_source?: string | null; parent_id?: string | null },
  byId: Map<string, { external_uid?: string | null }>,
): boolean {
  if (!row.external_source || !PORTAL_SOURCES.has(row.external_source)) return false
  const parent = row.parent_id ? byId.get(row.parent_id) : undefined
  const uid = parent?.external_uid ?? null
  // Under an assignee group that is not 'me' -> theirs. Under the root or
  // under 'me' -> mine (or unassigned, which you should see).
  return uid !== null && uid.includes('assignee:') && !uid.endsWith('assignee:me')
}

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
  if (!Array.isArray(feed.all_tasks)) throw new Error('Exec portal feed had no all_tasks array.')
  const mineIds = new Set(feed.tasks.map(t => t.id))
  const source = config.source ?? SOURCE
  const M = markers(source)

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
    i => i.external_source === source && i.external_uid === M.project,
  )
  let projectCreated = false
  if (!project) {
    const { data, error } = await db
      .from('items')
      .insert({
        title: config.title ?? PROJECT_TITLE,
        parent_id: null,
        is_group: true,
        board: 'pinned',
        external_source: source,
        external_uid: M.project,
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

  /**
   * ── a sub-project per assignee ──
   *
   * Found by marker, never by name: a name can be corrected on the portal and
   * the group must follow it rather than fork. Your own group carries ME_UID
   * so the rest of the app can tell mine from theirs without knowing your id.
   */
  const groups = new Map<string, string>()   // uid -> item id
  const groupsCreated: string[] = []
  const wanted = new Map<string, string>()   // uid -> title
  wanted.set(M.me, `${feed.member.name} (me)`)
  for (const t of feed.all_tasks) {
    for (const a of t.assignees ?? []) {
      if (a.id === feed.member.id) continue
      wanted.set(M.assignee(a.id), a.name)
    }
  }

  for (const [uid, title] of wanted) {
    const existing = items.find(i => i.external_source === source && i.external_uid === uid)
    if (existing) {
      groups.set(uid, existing.id)
      const fix: Record<string, unknown> = {}
      if (existing.title !== title) fix.title = title
      if (existing.parent_id !== project!.id) fix.parent_id = project!.id
      if (existing.archived_at) fix.archived_at = null
      if (Object.keys(fix).length) await db.from('items').update(fix).eq('id', existing.id)
      continue
    }
    const { data, error } = await db
      .from('items')
      .insert({
        title,
        parent_id: project!.id,
        is_group: true,
        external_source: source,
        external_uid: uid,
        external_synced_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) throw error
    groups.set(uid, data.id)
    groupsCreated.push(title)
  }

  /**
   * One row has one parent, and five tasks here have two assignees. Filed
   * under you when you are on it — those are the ones you act on — otherwise
   * under the first assignee, with everyone else named at the top of notes so
   * the sharing is not lost.
   */
  const homeFor = (t: FeedTask): string => {
    if (mineIds.has(t.id) || (t.assignees ?? []).some(a => a.id === feed.member.id)) {
      return groups.get(M.me)!
    }
    const first = (t.assignees ?? [])[0]
    return (first && groups.get(M.assignee(first.id))) ?? project!.id
  }
  const notesFor = (t: FeedTask): string | null => {
    // Name everyone EXCEPT whoever it is filed under: 'With Maria' on a task
    // sitting in Maria's own group is noise.
    const assignees = t.assignees ?? []
    const homeId = assignees.some(a => a.id === feed.member.id)
      ? feed.member.id
      : assignees[0]?.id
    const others = assignees.filter(a => a.id !== homeId).map(a => a.name)
    const shared = others.length > 0 ? `With ${others.join(', ')}` : ''
    const body = t.description?.trim() ?? ''
    return [shared, body].filter(Boolean).join('\n\n') || null
  }

  // ── tasks ──
  const isGroupUid = (uid: string | null) => uid === M.project || (uid ?? '').includes('assignee:')
  const mine = items.filter(
    i => i.external_source === source && i.external_uid && !isGroupUid(i.external_uid),
  )
  const byUid = new Map(mine.map(i => [i.external_uid!, i]))
  const seen = new Set<string>()

  let created = 0
  let updated = 0
  let unchanged = 0
  let skippedArchived = 0
  let archived = 0

  for (const task of feed.all_tasks) {
    seen.add(task.id)
    const existing = byUid.get(task.id)
    const notes = notesFor(task)
    const progress = progressOf(task.status)
    const parentId = homeFor(task)

    if (!existing) {
      const { error } = await db.from('items').insert({
        title: task.title,
        notes,
        parent_id: parentId,
        due_date: task.due_date,
        progress,
        // Seeded once, never written again: priority is yours after this.
        priority: seedPriority(task.priority),
        link: task.url ?? null,
        external_uid: task.id,
        external_source: source,
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
      existing.parent_id !== parentId ||
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
        parent_id: parentId,
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
      source,
    }))
    let { error } = await db.from('exec_portal_updates').upsert(rows, { onConflict: 'id' })
    // `source` arrives with migration 020. Until then, drop it and retry —
    // the PENDING_COLUMNS pattern from lib/db/items.ts.
    if (error?.code === 'PGRST204' && String(error.message).includes('source')) {
      ;({ error } = await db
        .from('exec_portal_updates')
        .upsert(rows.map(({ source: _s, ...rest }) => rest), { onConflict: 'id' }))
    }
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
    source,
    member: feed.member?.name ?? null,
    tasks: feed.all_tasks.length,
    mine: feed.tasks.length,
    assignees: [...wanted.values()].sort(),
    groupsCreated,
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
