// ================================================================
// Portal types — shared across admin and contributor views
// ================================================================

export type ProjectStatus   = 'on_track' | 'needs_followup' | 'waiting' | 'completed'
export type TaskStatus      = 'pending'  | 'in_progress'    | 'completed'
export type NotifFrequency  = 'daily'    | 'every_other_day' | 'weekly'
export type NotifType       = 'task_completed' | 'update_posted'

// ----------------------------------------------------------------
// Raw DB rows
// ----------------------------------------------------------------

export interface Project {
  id:          string
  name:        string
  description: string | null
  status:      ProjectStatus
  due_date:    string | null
  color:       string
  created_at:  string
  updated_at:  string
}

export interface Contributor {
  id:               string
  name:             string
  email:            string | null
  access_token:     string
  notif_frequency:  NotifFrequency
  last_notified_at: string | null
  created_at:       string
}

export interface Task {
  id:          string
  project_id:  string
  title:       string
  description: string | null
  due_date:    string | null
  sort_order:  number
  created_at:  string
  updated_at:  string
}

export interface TaskAssignment {
  id:             string
  task_id:        string
  contributor_id: string
  status:         TaskStatus
  completed_at:   string | null
  created_at:     string
}

export interface TaskUpdate {
  id:            string
  assignment_id: string
  content:       string
  created_at:    string
}

export interface ProjectNote {
  id:         string
  project_id: string
  content:    string
  is_pinned:  boolean
  created_at: string
}

export interface AdminNotification {
  id:            string
  type:          NotifType
  assignment_id: string
  is_read:       boolean
  created_at:    string
}

// ----------------------------------------------------------------
// Enriched / joined shapes for UI
// ----------------------------------------------------------------

/** Returned by the project_summary view */
export interface ProjectSummary extends Project {
  task_count:        number
  completed_count:   number
  contributor_count: number
  pinned_note:       string | null
}

/** Admin project detail — task with all its assignments */
export interface TaskWithAssignments extends Task {
  assignments: (TaskAssignment & { contributor: Pick<Contributor, 'id' | 'name' | 'email'> })[]
}

/** Admin notification feed item */
export interface NotificationFeedItem extends AdminNotification {
  assignment: TaskAssignment & {
    task:        Pick<Task, 'id' | 'title' | 'project_id'>
    contributor: Pick<Contributor, 'id' | 'name'>
  }
}

/** What the contributor portal renders per task */
export interface ContributorTask {
  assignment_id:   string
  status:          TaskStatus
  completed_at:    string | null
  task_id:         string
  task_title:      string
  task_description: string | null
  task_due_date:   string | null
  project_id:      string
  project_name:    string
  project_color:   string
  updates:         TaskUpdate[]
}

/** Contributor grouped by project (for the portal task list) */
export interface ContributorProjectGroup {
  project_id:   string
  project_name: string
  project_color: string
  tasks:        ContributorTask[]
}

// ----------------------------------------------------------------
// API payloads
// ----------------------------------------------------------------

export interface PortalAuthPayload {
  pin: string
}

export interface UpdateTaskStatusPayload {
  status: TaskStatus
}

export interface PostTaskUpdatePayload {
  content: string
}

export interface UpdateNotifPrefsPayload {
  notif_frequency: NotifFrequency
  email:           string
}
