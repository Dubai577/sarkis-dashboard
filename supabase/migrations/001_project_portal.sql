-- ================================================================
-- PROJECT PORTAL  —  Migration 001
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- TABLES
-- ----------------------------------------------------------------

create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text,
  status      text        not null default 'on_track'
                check (status in ('on_track','needs_followup','waiting','completed')),
  due_date    date,
  color       text        not null default '#6366f1',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists contributors (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  email            text,
  pin_hash         text        not null,  -- bcrypt via pgcrypto crypt()
  access_token     uuid        not null unique default gen_random_uuid(),
  notif_frequency  text        not null default 'daily'
                     check (notif_frequency in ('daily','every_other_day','weekly')),
  last_notified_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists tasks (
  id          uuid        primary key default gen_random_uuid(),
  project_id  uuid        not null references projects(id) on delete cascade,
  title       text        not null,
  description text,
  due_date    date,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists task_assignments (
  id             uuid        primary key default gen_random_uuid(),
  task_id        uuid        not null references tasks(id) on delete cascade,
  contributor_id uuid        not null references contributors(id) on delete cascade,
  status         text        not null default 'pending'
                   check (status in ('pending','in_progress','completed')),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (task_id, contributor_id)
);

create table if not exists task_updates (
  id            uuid        primary key default gen_random_uuid(),
  assignment_id uuid        not null references task_assignments(id) on delete cascade,
  content       text        not null,
  created_at    timestamptz not null default now()
);

create table if not exists project_notes (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references projects(id) on delete cascade,
  content    text        not null,
  is_pinned  boolean     not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admin_notifications (
  id            uuid        primary key default gen_random_uuid(),
  type          text        not null
                  check (type in ('task_completed','update_posted')),
  assignment_id uuid        not null references task_assignments(id) on delete cascade,
  is_read       boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------

create index if not exists idx_tasks_project_id              on tasks(project_id);
create index if not exists idx_assignments_task_id           on task_assignments(task_id);
create index if not exists idx_assignments_contributor_id    on task_assignments(contributor_id);
create index if not exists idx_task_updates_assignment_id    on task_updates(assignment_id);
create index if not exists idx_project_notes_project_id      on project_notes(project_id);
create index if not exists idx_admin_notifs_is_read          on admin_notifications(is_read);
create index if not exists idx_contributors_access_token     on contributors(access_token);
create index if not exists idx_admin_notifs_created_at       on admin_notifications(created_at desc);

-- ----------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_updated_at();

-- Auto-stamp completed_at when status flips to completed
create or replace function set_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

create trigger assignment_completed_at
  before update on task_assignments
  for each row execute function set_completed_at();

-- Auto-insert admin_notification when a task is marked complete
create or replace function notify_on_completion()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    insert into admin_notifications (type, assignment_id)
    values ('task_completed', new.id);
  end if;
  return new;
end;
$$;

create trigger assignment_completion_notify
  after update on task_assignments
  for each row execute function notify_on_completion();

-- Auto-insert admin_notification when a contributor posts an update
create or replace function notify_on_update()
returns trigger language plpgsql as $$
begin
  insert into admin_notifications (type, assignment_id)
  values ('update_posted', new.assignment_id);
  return new;
end;
$$;

create trigger update_posted_notify
  after insert on task_updates
  for each row execute function notify_on_update();

-- ----------------------------------------------------------------
-- PIN AUTH  (pgcrypto)
-- ----------------------------------------------------------------

-- Called from /api/portal/auth  — returns the matching contributor row
create or replace function verify_contributor_pin(entered_pin text)
returns table (
  id               uuid,
  name             text,
  email            text,
  access_token     uuid,
  notif_frequency  text,
  last_notified_at timestamptz
)
language sql security definer stable as $$
  select id, name, email, access_token, notif_frequency, last_notified_at
  from contributors
  where pin_hash = crypt(entered_pin, pin_hash)
  limit 1;
$$;

-- Helper used by RLS policies: resolve contributor from the custom header
-- that the portal API routes set on every Supabase call.
create or replace function get_contributor_id()
returns uuid language sql security definer stable as $$
  select id from contributors
  where access_token = (
    nullif(current_setting('request.headers', true), '')::json ->> 'x-contributor-token'
  )::uuid
  limit 1;
$$;

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------

alter table projects            enable row level security;
alter table contributors        enable row level security;
alter table tasks               enable row level security;
alter table task_assignments    enable row level security;
alter table task_updates        enable row level security;
alter table project_notes       enable row level security;
alter table admin_notifications enable row level security;

-- service_role (used by admin server routes) bypasses RLS automatically.
-- The policies below apply to the anon role used by contributor API calls.

-- contributors: read and update own profile
create policy "contributor_read_self"
  on contributors for select
  using (id = get_contributor_id());

create policy "contributor_update_self"
  on contributors for update
  using (id = get_contributor_id())
  with check (id = get_contributor_id());

-- tasks: read tasks assigned to the contributor
create policy "contributor_read_assigned_tasks"
  on tasks for select
  using (
    id in (
      select task_id from task_assignments
      where contributor_id = get_contributor_id()
    )
  );

-- projects: read projects that contain the contributor's tasks
create policy "contributor_read_assigned_projects"
  on projects for select
  using (
    id in (
      select t.project_id from tasks t
      join task_assignments ta on ta.task_id = t.id
      where ta.contributor_id = get_contributor_id()
    )
  );

-- task_assignments: read own, update status only
create policy "contributor_read_own_assignments"
  on task_assignments for select
  using (contributor_id = get_contributor_id());

create policy "contributor_update_own_assignments"
  on task_assignments for update
  using (contributor_id = get_contributor_id())
  with check (contributor_id = get_contributor_id());

-- task_updates: insert and read on own assignments
create policy "contributor_insert_updates"
  on task_updates for insert
  with check (
    assignment_id in (
      select id from task_assignments
      where contributor_id = get_contributor_id()
    )
  );

create policy "contributor_read_updates"
  on task_updates for select
  using (
    assignment_id in (
      select id from task_assignments
      where contributor_id = get_contributor_id()
    )
  );

-- ----------------------------------------------------------------
-- VIEWS  (admin only — accessed via service_role)
-- ----------------------------------------------------------------

create or replace view project_summary as
with task_progress as (
  select
    t.project_id,
    t.id                                                             as task_id,
    count(sa.id)                                                     as total_assignments,
    count(case when sa.status = 'completed' then 1 end)             as done_assignments
  from tasks t
  left join subtasks s              on s.task_id    = t.id
  left join subtask_assignments sa  on sa.subtask_id = s.id
  group by t.project_id, t.id
)
select
  p.*,
  count(distinct tp.task_id)                                                                        as task_count,
  count(distinct case when tp.total_assignments > 0
                       and tp.total_assignments = tp.done_assignments then tp.task_id end)          as completed_count,
  count(distinct pm.contributor_id)                                                                 as contributor_count,
  count(distinct case when pm.role = 'admin' then pm.contributor_id end)                           as admin_count,
  max(pn.content) filter (where pn.is_pinned = true)                                               as pinned_note
from projects p
left join project_members pm  on pm.project_id  = p.id
left join task_progress tp    on tp.project_id   = p.id
left join project_notes pn    on pn.project_id   = p.id
group by p.id;

-- ----------------------------------------------------------------
-- HOW TO CREATE CONTRIBUTORS  (run manually per contributor)
-- ----------------------------------------------------------------
-- insert into contributors (name, email, pin_hash, notif_frequency)
-- values (
--   'Mary Girgis',
--   'mary@example.com',
--   crypt('482910', gen_salt('bf')),   -- replace 482910 with their 6-digit PIN
--   'weekly'
-- );
