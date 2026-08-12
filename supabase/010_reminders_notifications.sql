-- ================================================================
-- Migration 010 — Release 4: configurable reminders, and the admin
--                 notification trigger that has never fired
--
-- ROLLBACK:
--   drop table if exists reminders cascade;
--   drop trigger if exists subtask_completion_admin_notify on subtask_assignments;
--   drop function if exists notify_admin_on_subtask_complete();
--   alter table admin_notifications
--     drop column if exists subtask_assignment_id,
--     alter column assignment_id set not null;
--
-- Safe to re-run.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Reminders
--
-- From the user's own fixes list: "set reminders that email me before an event
-- by diff frequencies (ex, 2 days, 1 week, etc. make it fully customizable) or
-- if theres no dates set as a to do list then i can select to be reminded
-- about whatever tasks or categories on this day".
--
-- Two shapes, one table:
--   offset  — fire N days before a dated item or sweat assignment
--   absolute— fire on a fixed date, for undated items or a whole category
--
-- Exactly one target must be set. last_sent_on makes sending idempotent: the
-- digest job stamps the date it sent, so a second run the same day is a no-op.
-- ----------------------------------------------------------------

create table if not exists reminders (
  id           uuid        primary key default gen_random_uuid(),

  kind         text        not null check (kind in ('offset','absolute')),
  offset_days  integer     check (offset_days is null or offset_days between 0 and 365),
  fire_on      date,

  item_id      uuid references items(id)       on delete cascade,
  sweat_id     uuid references sweat_tasks(id) on delete cascade,
  category_id  uuid references categories(id)  on delete cascade,

  note         text,
  is_active    boolean     not null default true,
  last_sent_on date,
  created_at   timestamptz not null default now(),

  check (kind <> 'offset'   or offset_days is not null),
  check (kind <> 'absolute' or fire_on is not null),

  -- exactly one target
  check (
    (case when item_id     is not null then 1 else 0 end) +
    (case when sweat_id    is not null then 1 else 0 end) +
    (case when category_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists idx_reminders_item     on reminders (item_id)     where item_id     is not null;
create index if not exists idx_reminders_sweat    on reminders (sweat_id)    where sweat_id    is not null;
create index if not exists idx_reminders_category on reminders (category_id) where category_id is not null;
create index if not exists idx_reminders_active   on reminders (is_active)   where is_active;

alter table reminders enable row level security;
revoke all on reminders from anon;

-- ----------------------------------------------------------------
-- 2. Admin notifications
--
-- admin_notifications.assignment_id is NOT NULL and references the legacy
-- task_assignments table, which holds 0 rows. Migration 003's trigger tried to
-- resolve a task_assignment for a completed SUBTASK assignment via a LEFT JOIN,
-- got NULL, and would have violated the NOT NULL constraint — so completing a
-- subtask in the portal would have failed outright. It evidently was never
-- installed, which is why 6 subtasks completed successfully and 0 notifications
-- exist.
--
-- Fix: add a column that points at the row that actually completed, make the
-- legacy column nullable, and have the trigger write the subtask assignment.
-- ----------------------------------------------------------------

alter table admin_notifications
  add column if not exists subtask_assignment_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_notifs_subtask_fk') then
    alter table admin_notifications add constraint admin_notifs_subtask_fk
      foreign key (subtask_assignment_id)
      references subtask_assignments(id) on delete cascade;
  end if;
end $$;

alter table admin_notifications alter column assignment_id drop not null;

-- At least one target, so a notification can never point at nothing.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admin_notifs_target_check') then
    alter table admin_notifications add constraint admin_notifs_target_check
      check (assignment_id is not null or subtask_assignment_id is not null);
  end if;
end $$;

create index if not exists idx_admin_notifs_subtask
  on admin_notifications (subtask_assignment_id) where subtask_assignment_id is not null;

create or replace function public.notify_admin_on_subtask_complete()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    insert into admin_notifications (type, subtask_assignment_id)
    values ('task_completed', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists subtask_completion_admin_notify on subtask_assignments;
create trigger subtask_completion_admin_notify
  after update on subtask_assignments
  for each row execute function public.notify_admin_on_subtask_complete();

-- Backfill the 6 completions that happened while no trigger existed, so the
-- first digest reports real history instead of silence.
insert into admin_notifications (type, subtask_assignment_id, is_read, created_at)
select 'task_completed', sa.id, false, coalesce(sa.completed_at, now())
from   subtask_assignments sa
where  sa.status = 'completed'
  and  not exists (
         select 1 from admin_notifications an
         where  an.subtask_assignment_id = sa.id
       );

commit;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------

select count(*) as reminders_table_exists from reminders;   -- 0 rows, no error

-- Should now equal the number of completed subtask assignments (6).
select
  (select count(*) from subtask_assignments where status = 'completed') as completed,
  (select count(*) from admin_notifications where subtask_assignment_id is not null) as notifications;

-- Trigger installed
select tgname from pg_trigger
where  tgrelid = 'subtask_assignments'::regclass and not tgisinternal;

select tablename, rowsecurity from pg_tables
where  schemaname = 'public' and tablename = 'reminders';
