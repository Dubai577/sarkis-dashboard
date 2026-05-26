-- ================================================================
-- Migration 002 — Subtasks, dependencies, shared resources
-- Run in Supabase SQL Editor
-- ================================================================

-- Subtasks (sections / parts of a task)
create table if not exists subtasks (
  id          uuid        primary key default gen_random_uuid(),
  task_id     uuid        not null references tasks(id) on delete cascade,
  title       text        not null,
  description text,
  due_date    date,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

-- Who's assigned to each subtask
create table if not exists subtask_assignments (
  id             uuid        primary key default gen_random_uuid(),
  subtask_id     uuid        not null references subtasks(id) on delete cascade,
  contributor_id uuid        not null references contributors(id) on delete cascade,
  status         text        not null default 'pending'
                   check (status in ('pending','in_progress','completed')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (subtask_id, contributor_id)
);

-- Task dependencies: task_id is WAITING on depends_on_task_id
create table if not exists task_dependencies (
  id                 uuid        primary key default gen_random_uuid(),
  task_id            uuid        not null references tasks(id) on delete cascade,
  depends_on_task_id uuid        not null references tasks(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (task_id, depends_on_task_id),
  check  (task_id <> depends_on_task_id)
);

-- Shared scratchpad per task (links + notes)
create table if not exists task_resources (
  id                   uuid        primary key default gen_random_uuid(),
  task_id              uuid        not null references tasks(id) on delete cascade,
  type                 text        not null check (type in ('link','note')),
  content              text        not null,
  label                text,
  posted_by_contributor uuid       references contributors(id) on delete set null,
  is_admin_post        boolean     not null default false,
  created_at           timestamptz not null default now()
);

-- Queued emails for dependency resolution
create table if not exists dependency_notifications (
  id               uuid        primary key default gen_random_uuid(),
  dependent_task_id uuid       not null references tasks(id) on delete cascade,
  blocking_task_id  uuid       not null references tasks(id) on delete cascade,
  notified         boolean     not null default false,
  created_at       timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────

create index if not exists idx_subtasks_task_id               on subtasks(task_id);
create index if not exists idx_subtask_assignments_subtask_id on subtask_assignments(subtask_id);
create index if not exists idx_subtask_assignments_contrib     on subtask_assignments(contributor_id);
create index if not exists idx_task_deps_task_id              on task_dependencies(task_id);
create index if not exists idx_task_deps_blocking             on task_dependencies(depends_on_task_id);
create index if not exists idx_task_resources_task_id         on task_resources(task_id);
create index if not exists idx_dep_notifs_notified            on dependency_notifications(notified);

-- ── Triggers ─────────────────────────────────────────────────────

-- Auto-stamp completed_at (reuse existing set_completed_at function)
create trigger subtask_assignment_completed_at
  before update on subtask_assignments
  for each row execute function set_completed_at();

-- When all subtask_assignments under a task complete → queue dependency emails
create or replace function check_task_completion()
returns trigger language plpgsql as $$
declare
  v_task_id      uuid;
  v_all_complete boolean;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select task_id into v_task_id
  from subtasks where id = new.subtask_id;

  -- Are ALL subtask assignments for this task now complete?
  select bool_and(sa.status = 'completed') into v_all_complete
  from subtasks s
  join subtask_assignments sa on sa.subtask_id = s.id
  where s.task_id = v_task_id;

  if v_all_complete then
    -- Insert a dependency_notification for every task waiting on this one
    insert into dependency_notifications (dependent_task_id, blocking_task_id)
    select td.task_id, v_task_id
    from task_dependencies td
    where td.depends_on_task_id = v_task_id;
  end if;

  return new;
end;
$$;

create trigger subtask_completion_check
  after update on subtask_assignments
  for each row execute function check_task_completion();
