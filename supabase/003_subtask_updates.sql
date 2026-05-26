-- ================================================================
-- Migration 003 — Subtask updates + contributor notification trigger
-- Run in Supabase SQL Editor
-- ================================================================

-- Updates contributors can leave on their subtask assignments
CREATE TABLE IF NOT EXISTS subtask_updates (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_assignment_id uuid        NOT NULL REFERENCES subtask_assignments(id) ON DELETE CASCADE,
  content               text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtask_updates_assignment ON subtask_updates(subtask_assignment_id);

ALTER TABLE subtask_updates ENABLE ROW LEVEL SECURITY;

-- Contributors can insert and read updates on their own subtask assignments
CREATE POLICY "contributor_insert_subtask_updates"
  ON subtask_updates FOR INSERT
  WITH CHECK (
    subtask_assignment_id IN (
      SELECT id FROM subtask_assignments
      WHERE contributor_id = get_contributor_id()
    )
  );

CREATE POLICY "contributor_read_subtask_updates"
  ON subtask_updates FOR SELECT
  USING (
    subtask_assignment_id IN (
      SELECT id FROM subtask_assignments
      WHERE contributor_id = get_contributor_id()
    )
  );

-- RLS on subtasks + subtask_assignments for contributors
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtask_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Contributors can read subtasks for tasks in their projects
CREATE POLICY "contributor_read_subtasks"
  ON subtasks FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE pm.contributor_id = get_contributor_id()
    )
  );

-- Contributors can read and update their own subtask assignments
CREATE POLICY "contributor_read_subtask_assignments"
  ON subtask_assignments FOR SELECT
  USING (contributor_id = get_contributor_id());

CREATE POLICY "contributor_update_subtask_assignments"
  ON subtask_assignments FOR UPDATE
  USING (contributor_id = get_contributor_id())
  WITH CHECK (contributor_id = get_contributor_id());

-- Contributors can read resources for tasks in their projects
CREATE POLICY "contributor_read_task_resources"
  ON task_resources FOR SELECT
  USING (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE pm.contributor_id = get_contributor_id()
    )
  );

-- Contributors can insert resources on tasks in their projects
CREATE POLICY "contributor_insert_task_resources"
  ON task_resources FOR INSERT
  WITH CHECK (
    task_id IN (
      SELECT t.id FROM tasks t
      JOIN project_members pm ON pm.project_id = t.project_id
      WHERE pm.contributor_id = get_contributor_id()
    )
  );

-- Admin notification when subtask is completed
CREATE OR REPLACE FUNCTION notify_admin_on_subtask_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    -- Reuse admin_notifications with a task_assignment placeholder approach
    -- We insert using the subtask_assignment id cast — admin dashboard queries by type
    INSERT INTO admin_notifications (type, assignment_id)
    SELECT 'task_completed', ta.id
    FROM subtasks s
    JOIN tasks t ON t.id = s.task_id
    LEFT JOIN task_assignments ta ON ta.task_id = t.id AND ta.contributor_id = NEW.contributor_id
    WHERE s.id = NEW.subtask_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subtask_completion_admin_notify ON subtask_assignments;
CREATE TRIGGER subtask_completion_admin_notify
  AFTER UPDATE ON subtask_assignments
  FOR EACH ROW EXECUTE FUNCTION notify_admin_on_subtask_complete();
