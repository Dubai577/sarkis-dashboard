// Server-only by convention: this module is imported solely by route handlers.
import { createAdminClient } from '@/lib/supabase/admin'
import { today as todayIso } from '@/lib/dates'
import { possessionOf, type Possession } from '@/lib/possession'
import { heatOf, heatBand, type HeatBand } from '@/lib/heat'
import type { Category, Item, Person, Uuid } from '@/lib/types/entities'

/**
 * Item reads. One place builds the shape the surfaces need, so possession and
 * heat can never be computed differently on two screens.
 */

export interface ItemView extends Item {
  possession: Possession
  heat: number
  band: HeatBand
  child_count: number
  open_child_count: number
  blocked_child_count: number
  category: Category | null
  waiting_person: Pick<Person, 'id' | 'name'> | null
  people: { id: Uuid; name: string; relation: string }[]
  /** Marked a container, or holding something. Either makes it one. */
  is_group_view: boolean
}

/**
 * Columns that exist in the code before they exist in the database, because
 * migrations here are applied by hand and a deploy can land first.
 *
 * Threading `link` into a write and shipping ahead of migration 014 took every
 * item read down at once. Rather than rely on remembering the order, an insert
 * that trips over a not-yet-created column drops it and retries: the row still
 * lands, the flag is simply not recorded until the migration runs.
 */
const PENDING_COLUMNS =
  ['is_group', 'link', 'progress', 'external_uid', 'external_source', 'external_synced_at'] as const

/**
 * PostgREST rejects an unknown column from its own schema cache with PGRST204
 * long before Postgres would raise 42703, so checking only the Postgres code
 * matched nothing and the tolerance never fired. Match either, and require the
 * column name in the message so an unrelated failure is never swallowed.
 */
function pendingColumnIn(error: { code?: string; message?: string } | null) {
  if (!error) return undefined
  if (error.code !== '42703' && error.code !== 'PGRST204') return undefined
  return PENDING_COLUMNS.find(c => (error.message ?? '').includes(c))
}

export async function insertItems(
  db: ReturnType<typeof createAdminClient>,
  rows: Record<string, unknown>[],
) {
  let payload = rows
  for (let attempt = 0; attempt <= PENDING_COLUMNS.length; attempt++) {
    const { data, error } = await db.from('items').insert(payload).select()
    if (!error) return data
    const missing = pendingColumnIn(error)
    if (!missing) throw error
    payload = payload.map(({ [missing]: _dropped, ...rest }) => rest)
  }
  throw new Error('items insert failed after dropping every pending column')
}

/**
 * The same tolerance for updates.
 *
 * Making only inserts tolerant was worse than making neither: creating a row
 * quietly succeeded while editing the same field 500'd, so "rename is broken"
 * was the symptom of a column that does not exist yet. If every field in the
 * patch turns out to be pending, the row is returned unchanged rather than
 * sending Postgres an empty update.
 */
export async function updateItem(
  db: ReturnType<typeof createAdminClient>,
  id: Uuid,
  patch: Record<string, unknown>,
) {
  let payload = patch
  for (let attempt = 0; attempt <= PENDING_COLUMNS.length; attempt++) {
    if (Object.keys(payload).length === 0) {
      const { data } = await db.from('items').select(COLUMNS).eq('id', id).single()
      return data
    }
    const { data, error } = await db.from('items').update(payload).eq('id', id).select().single()
    if (!error) return data
    const missing = pendingColumnIn(error)
    if (!missing) throw error
    payload = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== missing))
  }
  throw new Error('items update failed after dropping every pending column')
}

/**
 * '*' rather than a column list, deliberately.
 *
 * Naming columns here couples every item read to whichever migration last
 * added one: threading `link` into this list and deploying before migration
 * 014 had run turned every read into a 500 — the hub, projects, people and
 * the list all went down at once. `items` is a narrow table, so the cost of
 * selecting everything is nil next to that failure mode.
 */
const COLUMNS = '*'

/**
 * Loads every non-archived item once and assembles the views in memory.
 *
 * At the real scale — 82 items across 13 roots, growing to a few hundred —
 * this is one round trip instead of a per-row count query, and child counts
 * and blocked-child counts both need the whole set anyway. Revisit if items
 * ever reaches the low thousands.
 */
export async function loadItemViews(opts: {
  includeArchived?: boolean
  now?: string
} = {}): Promise<ItemView[]> {
  const db = createAdminClient()
  const now = opts.now ?? todayIso()

  let query = db.from('items').select(COLUMNS)
  if (!opts.includeArchived) query = query.is('archived_at', null)

  const [{ data: items, error }, { data: categories }, { data: links }, { data: people }] =
    await Promise.all([
      query.order('sort_order').order('created_at'),
      db.from('categories').select('*').order('sort_order'),
      db.from('item_people').select('item_id,person_id,relation'),
      db.from('people').select('id,name'),
    ])

  if (error) throw error

  const rows = (items ?? []) as unknown as Item[]
  const catById = new Map((categories ?? []).map(c => [c.id, c as Category]))
  const personById = new Map((people ?? []).map(p => [p.id, p as Pick<Person, 'id' | 'name'>]))

  const linksByItem = new Map<string, { id: Uuid; name: string; relation: string }[]>()
  for (const l of links ?? []) {
    const person = personById.get(l.person_id)
    if (!person) continue
    const list = linksByItem.get(l.item_id) ?? []
    list.push({ id: person.id, name: person.name, relation: l.relation })
    linksByItem.set(l.item_id, list)
  }

  // First pass: possession, which blocked-child counts depend on.
  const possessions = new Map<string, Possession>()
  for (const r of rows) possessions.set(r.id, possessionOf(r, now))

  const childCount = new Map<string, number>()
  const openCount = new Map<string, number>()
  const blockedCount = new Map<string, number>()

  for (const r of rows) {
    if (!r.parent_id) continue
    childCount.set(r.parent_id, (childCount.get(r.parent_id) ?? 0) + 1)
    // Nothing is archived in this set, so every child is open.
    openCount.set(r.parent_id, (openCount.get(r.parent_id) ?? 0) + 1)
    if (possessions.get(r.id) === 'dropped') {
      blockedCount.set(r.parent_id, (blockedCount.get(r.parent_id) ?? 0) + 1)
    }
  }

  return rows.map(r => {
    const blocked = blockedCount.get(r.id) ?? 0
    const open = openCount.get(r.id) ?? 0
    const heat = heatOf(
      { ...r, blocked_children: blocked, open_children: open },
      now,
    )
    return {
      ...r,
      possession: possessions.get(r.id)!,
      heat,
      band: heatBand(heat),
      child_count: childCount.get(r.id) ?? 0,
      is_group_view: r.is_group === true || (childCount.get(r.id) ?? 0) > 0,
      open_child_count: open,
      blocked_child_count: blocked,
      category: r.category_id ? catById.get(r.category_id) ?? null : null,
      waiting_person: r.waiting_on ? personById.get(r.waiting_on) ?? null : null,
      people: linksByItem.get(r.id) ?? [],
    }
  })
}

/**
 * What belongs on the projects board.
 *
 *   auto    included once it has children — a thing becomes a project by
 *           gaining detail, never by being re-filed
 *   pinned  always, so a single-action "project" like "gary rv" can sit there
 *   muted   never (the four life-areas)
 */
export function boardItems(views: ItemView[]): ItemView[] {
  return views.filter(v => {
    if (v.parent_id) return false
    if (v.board === 'muted') return false
    if (v.board === 'pinned') return true
    return v.is_group_view
  })
}

export function areaItems(views: ItemView[]): ItemView[] {
  return views.filter(v => !v.parent_id && (v.board === 'muted' || v.category?.is_area))
}

export function childrenOf(views: ItemView[], parentId: Uuid): ItemView[] {
  return views
    .filter(v => v.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
}

/** Root → … → item, for a breadcrumb. */
export function ancestorsOf(views: ItemView[], id: Uuid): ItemView[] {
  const byId = new Map(views.map(v => [v.id, v]))
  const chain: ItemView[] = []
  let cursor = byId.get(id)?.parent_id ?? null
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    chain.unshift(parent)
    cursor = parent.parent_id
  }
  return chain
}

/**
 * Comma-split preview. Several backlog rows are whole projects crammed into a
 * title — "Motor mounts, balljoint, windshield can, exhaust hanger".
 *
 * Splits on commas, ampersands and the bullet-ish separators that show up in
 * this data, keeps the text before an em dash or colon as the parent title,
 * and refuses to split anything that would produce a single child.
 */
export function splitPreview(title: string): { parent: string; children: string[] } {
  const lead = title.match(/^(.{2,40}?)\s*[—–:-]\s+(.+)$/)
  const parent = lead ? lead[1].trim() : title.trim()
  const body = lead ? lead[2] : title

  const children = body
    .split(/\s*(?:,|;|\s&\s|\s\+\s)\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 1)

  if (children.length < 2) return { parent: title.trim(), children: [] }
  return { parent, children }
}
