-- ================================================================
-- Migration 009 — Release 4: rollover, sync links, run log
--
-- ROLLBACK:
--   drop table if exists rollover_log, rollover_state cascade;
--   drop index if exists idx_todos_source_item_open, idx_todos_source_sweat_open;
--   alter table todos
--     drop column if exists placement,
--     drop column if exists origin_date,
--     drop column if exists roll_count,
--     drop column if exists source_item_id,
--     drop column if exists source_sweat_id;
--
-- Additive. No existing column changes type or meaning, and every new column
-- has a default that preserves current behaviour.
--
-- Safe to re-run.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Placement and provenance on todos
--
-- placement distinguishes a date the user chose from one the system assigned.
-- Manual placement is protected only while the date is still in the future;
-- once it passes unchecked it walks like anything else, so a deliberately
-- scheduled task cannot become invisible on a day view that defaults to today.
--
-- origin_date and roll_count store provenance as data. The Apps Script version
-- appended "(from 5/12)" to the title, which accumulated into
-- "Task (from 5/12) (from 5/13) (from 5/14)". Storing the original date makes
-- the tag a render concern, so it structurally cannot stack.
-- ----------------------------------------------------------------

alter table todos add column if not exists placement text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'todos_placement_check'
  ) then
    alter table todos add constraint todos_placement_check
      check (placement in ('auto','manual'));
  end if;
end $$;

alter table todos add column if not exists origin_date date;
alter table todos add column if not exists roll_count  integer not null default 0;

-- Existing rows were placed by hand, before rollover existed.
update todos set placement = 'manual' where placement = 'auto' and roll_count = 0;

-- origin_date defaults to where the task started, which is where it is now.
update todos set origin_date = task_date where origin_date is null;

-- ----------------------------------------------------------------
-- 2. Source links — real foreign keys, not polymorphic columns
--
-- Two nullable FKs with a CHECK that at most one is set, so "deleting the
-- source removes the materialized row" is enforced by the database rather than
-- hoped for. A (source_table, source_id) pair could not carry a cascade.
-- ----------------------------------------------------------------

alter table todos add column if not exists source_item_id  uuid;
alter table todos add column if not exists source_sweat_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'todos_source_item_fk') then
    alter table todos add constraint todos_source_item_fk
      foreign key (source_item_id) references items(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'todos_source_sweat_fk') then
    alter table todos add constraint todos_source_sweat_fk
      foreign key (source_sweat_id) references sweat_tasks(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'todos_one_source_check') then
    alter table todos add constraint todos_one_source_check
      check (source_item_id is null or source_sweat_id is null);
  end if;
end $$;

-- One materialized row per source WHILE INCOMPLETE, globally — not per week.
-- Per-week uniqueness would let a slipped item reappear in every subsequent
-- week, one unchecked copy at a time.
create unique index if not exists idx_todos_source_item_open
  on todos (source_item_id) where source_item_id is not null and is_complete = false;

create unique index if not exists idx_todos_source_sweat_open
  on todos (source_sweat_id) where source_sweat_id is not null and is_complete = false;

create index if not exists idx_todos_placement on todos (placement) where is_complete = false;

-- ----------------------------------------------------------------
-- 3. Rollover state — idempotency
--
-- A single row holding the last date rollover completed through. Running twice
-- in one day is a no-op because the second run finds nothing left to walk.
-- The lazy catch-up path reads the same row, so cron and app-open cannot
-- disagree or double-process a day.
-- ----------------------------------------------------------------

create table if not exists rollover_state (
  id                 boolean     primary key default true check (id),
  last_rolled_through date,
  updated_at         timestamptz not null default now()
);

insert into rollover_state (id, last_rolled_through)
values (true, null)
on conflict (id) do nothing;

-- ----------------------------------------------------------------
-- 4. Run log — so a bad run is diagnosable afterwards
-- ----------------------------------------------------------------

create table if not exists rollover_log (
  id          uuid        primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  trigger     text        not null check (trigger in ('cron','lazy','manual')),
  from_date   date,
  through_date date,
  days_walked integer     not null default 0,
  moved       integer     not null default 0,
  merged      integer     not null default 0,
  skipped     integer     not null default 0,
  detail      jsonb,
  error       text
);

create index if not exists idx_rollover_log_ran_at on rollover_log (ran_at desc);

alter table rollover_state enable row level security;
alter table rollover_log   enable row level security;

revoke all on rollover_state from anon;
revoke all on rollover_log   from anon;

commit;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------

select column_name, data_type, column_default
from   information_schema.columns
where  table_name = 'todos'
  and  column_name in ('placement','origin_date','roll_count','source_item_id','source_sweat_id')
order  by column_name;

-- Every existing row marked manual, origin_date filled
select placement, count(*), count(origin_date) as with_origin
from   todos group by placement;

-- Both partial unique indexes present
select indexname from pg_indexes
where  tablename = 'todos' and indexname like 'idx_todos_source%';

-- Singleton state row
select * from rollover_state;

select tablename, rowsecurity from pg_tables
where  schemaname = 'public' and tablename in ('rollover_state','rollover_log');
