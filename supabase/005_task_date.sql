-- ================================================================
-- Migration 005 — Release 1, step 1 of 2: task_date becomes the truth
--
-- RUN THIS BEFORE DEPLOYING the Release 1 code.
--
-- This step is deliberately compatible in both directions. A trigger keeps
-- task_date, week_start and day_of_week in agreement no matter which of them
-- the writer supplies, so the currently-deployed code (which writes
-- week_start + day_of_week) and the Release 1 code (which writes task_date)
-- both work against this schema. That is what removes the window where live
-- code would face a schema it cannot write to.
--
-- Migration 006 converts week_start and day_of_week to generated columns and
-- must run AFTER the deploy. See the header of that file.
--
-- Safe to re-run.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Repair the one row whose week_start is not a Monday
--
-- Cause: a calendar date was produced with .toISOString() from a Date built in
-- local time. After ~8 PM Eastern, UTC has already moved to the next day, so
-- the Monday came back one day late.
--
-- Only 2026-05-26 (a Tuesday) is affected. day_of_week is stored independently
-- and stays 'Friday', so nothing has to be inferred. The guard clause makes
-- this a no-op on a second run.
-- ----------------------------------------------------------------

update todos
set    week_start = week_start - (extract(isodow from week_start)::int - 1)
where  extract(isodow from week_start) <> 1;

-- Fail loudly rather than silently continuing with bad data.
do $$
declare bad int;
begin
  select count(*) into bad from todos where extract(isodow from week_start) <> 1;
  if bad > 0 then
    raise exception 'still % row(s) with a non-Monday week_start', bad;
  end if;
end $$;

-- ----------------------------------------------------------------
-- 2. task_date
-- ----------------------------------------------------------------

alter table todos add column if not exists task_date date;

-- Backfill: week_start + the offset implied by day_of_week.
update todos
set    task_date = week_start + (
         array_position(
           array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
           day_of_week
         ) - 1
       )
where  task_date is null;

do $$
declare missing int;
begin
  select count(*) into missing from todos where task_date is null;
  if missing > 0 then
    raise exception '% row(s) could not be backfilled — check day_of_week spelling', missing;
  end if;
end $$;

-- ----------------------------------------------------------------
-- 3. Keep all three columns in agreement, whichever one is written
--
-- Dropped again in 006, once generated columns take over the same job.
-- ----------------------------------------------------------------

create or replace function todos_sync_dates()
returns trigger language plpgsql as $$
declare
  names text[] := array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  idx   int;
begin
  if tg_op = 'INSERT' then

    if new.task_date is not null then
      -- Release 1 code: task_date is authoritative.
      new.week_start  := new.task_date - (extract(isodow from new.task_date)::int - 1);
      new.day_of_week := names[extract(isodow from new.task_date)::int];

    elsif new.week_start is not null and new.day_of_week is not null then
      -- Pre-Release-1 code: derive task_date, and snap week_start to its
      -- Monday so the original bug cannot reintroduce a bad value.
      idx := array_position(names, new.day_of_week);
      if idx is null then
        raise exception 'invalid day_of_week: %', new.day_of_week;
      end if;
      new.week_start := new.week_start - (extract(isodow from new.week_start)::int - 1);
      new.task_date  := new.week_start + (idx - 1);

    else
      raise exception 'todos needs task_date, or week_start together with day_of_week';
    end if;

  else  -- UPDATE

    if new.task_date is distinct from old.task_date then
      new.week_start  := new.task_date - (extract(isodow from new.task_date)::int - 1);
      new.day_of_week := names[extract(isodow from new.task_date)::int];

    elsif new.week_start is distinct from old.week_start
       or new.day_of_week is distinct from old.day_of_week then
      idx := array_position(names, new.day_of_week);
      if idx is null then
        raise exception 'invalid day_of_week: %', new.day_of_week;
      end if;
      new.week_start := new.week_start - (extract(isodow from new.week_start)::int - 1);
      new.task_date  := new.week_start + (idx - 1);
    end if;

  end if;

  return new;
end $$;

drop trigger if exists todos_sync_dates_trigger on todos;
create trigger todos_sync_dates_trigger
  before insert or update on todos
  for each row execute function todos_sync_dates();

alter table todos alter column task_date set not null;

-- ----------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------

create index if not exists idx_todos_task_date  on todos (task_date);
create index if not exists idx_todos_week_start on todos (week_start);
create index if not exists idx_todos_open       on todos (week_start) where is_complete = false;

commit;

-- ----------------------------------------------------------------
-- Verify — expect zero rows from the first query, and every row consistent.
-- ----------------------------------------------------------------

select id, title, week_start, day_of_week, task_date
from   todos
where  extract(isodow from week_start) <> 1
   or  task_date <> week_start + (
         array_position(
           array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
           day_of_week) - 1);

select week_start,
       to_char(week_start, 'Day') as starts_on,
       count(*)                   as rows
from   todos
group  by week_start
order  by week_start;
