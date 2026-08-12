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
}

const COLUMNS =
  'id,parent_id,title,notes,category_id,priority,status,planned_date,due_date,' +
  'start_time,end_time,sort_order,board,archived_at,waiting_on,waiting_since,' +
  'nudge_after,created_at,updated_at'

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
    return v.child_count > 0
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
