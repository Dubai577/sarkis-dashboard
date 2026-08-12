/**
 * One type definition per entity. Every route, component and digest imports
 * from here rather than redeclaring a shape locally.
 */

export type Uuid = string
/** 'YYYY-MM-DD' */
export type IsoDate = string

// ── categories ───────────────────────────────────────────────────

export interface Category {
  id: Uuid
  name: string
  color: string
  sort_order: number
  is_area: boolean
}

// ── people ───────────────────────────────────────────────────────

export interface Person {
  id: Uuid
  name: string
  email: string | null
  phone: string | null
  role_name: string | null
  contributor_id: Uuid | null
  notes: string | null
}

export type ItemRelation = 'mentioned' | 'assigned' | 'waiting_on' | 'owner'

export interface ItemPerson {
  item_id: Uuid
  person_id: Uuid
  relation: ItemRelation
}

// ── items ────────────────────────────────────────────────────────

export type BoardMode = 'auto' | 'pinned' | 'muted'

export interface Item {
  id: Uuid
  parent_id: Uuid | null
  title: string
  notes: string | null
  category_id: Uuid | null

  priority: string | null
  /**
   * Legacy column, carried over from sarkis_tasks. Nothing computes from it:
   * of 82 migrated rows, zero were ever 'Done' — completion was expressed by
   * deleting the row. Completion is archived_at now. Never rank or measure
   * progress from this field.
   */
  status: string | null

  planned_date: IsoDate | null
  due_date: IsoDate | null
  start_time: string | null
  end_time: string | null
  sort_order: number

  board: BoardMode
  archived_at: string | null

  waiting_on: Uuid | null
  waiting_since: IsoDate | null
  nudge_after: number

  created_at: string
  updated_at: string
}

/** An item with the extras the list and board surfaces need. */
export interface ItemWithMeta extends Item {
  child_count: number
  open_child_count: number
  category?: Category | null
  waiting_person?: Pick<Person, 'id' | 'name'> | null
  people?: Pick<Person, 'id' | 'name'>[]
}

// ── todos ────────────────────────────────────────────────────────

export type Placement = 'auto' | 'manual'

export interface Todo {
  id: Uuid
  title: string
  task_date: IsoDate
  /** Generated columns — readable, never writable. */
  week_start: IsoDate
  day_of_week: string

  is_complete: boolean
  completed_at: string | null
  sort_order: number
  category: string | null
  start_time: string | null
  end_time: string | null

  placement: Placement
  origin_date: IsoDate | null
  roll_count: number

  source_item_id: Uuid | null
  source_sweat_id: Uuid | null

  created_at: string
}

// ── sweat ────────────────────────────────────────────────────────

export interface SweatTask {
  id: Uuid
  course: string
  title: string
  assignment_type: string | null
  /** When I intend to finish. */
  my_due_date: IsoDate | null
  /** The professor's real deadline. The gap between the two is the feature. */
  actual_due_date: IsoDate | null
  due_date: IsoDate | null
  is_complete: boolean
  start_time: string | null
  end_time: string | null
}

// ── routines ─────────────────────────────────────────────────────

export type Cadence = 'daily' | 'alternating' | 'weekly_on'

export interface Routine {
  id: Uuid
  name: string
  cadence: Cadence
  /** weekly_on only. 0 = Monday … 6 = Sunday. */
  weekday: number | null
  /** alternating only. */
  anchor_date: IsoDate | null
  sort_order: number
  is_active: boolean
}

export interface RoutineCheck {
  routine_id: Uuid
  check_date: IsoDate
}

// ── notes ────────────────────────────────────────────────────────

export interface Note {
  id: Uuid
  content: string
  created_at: string
  updated_at: string | null
}

// ── reminders ────────────────────────────────────────────────────

export interface Reminder {
  id: Uuid
  kind: 'offset' | 'absolute'
  offset_days: number | null
  fire_on: IsoDate | null
  item_id: Uuid | null
  sweat_id: Uuid | null
  category_id: Uuid | null
  note: string | null
  is_active: boolean
  last_sent_on: IsoDate | null
}
