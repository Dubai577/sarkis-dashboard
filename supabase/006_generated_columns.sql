-- ================================================================
-- Migration 006 — Release 1, step 2 of 2: week_start and day_of_week
--                 become generated columns
--
-- RUN THIS ONLY AFTER the Release 1 code is deployed.
--
-- After this migration these two columns can no longer be written by anyone.
-- Pre-Release-1 code writes them on every insert, so running this while that
-- code is live would break task creation. Migration 005 plus the deploy must
-- both be done first.
--
-- Why generated rather than keeping the 005 trigger: a generated column makes
-- a non-Monday week_start structurally impossible. A trigger enforces the same
-- invariant but can be disabled, and a column that cannot be written cannot
-- drift from task_date at all.
--
-- Safe to re-run.
-- ================================================================

begin;

-- The trigger's job is taken over by the generated expressions below.
drop trigger if exists todos_sync_dates_trigger on todos;
drop function if exists todos_sync_dates();

-- Guard: refuse to continue unless every row is already consistent, so a
-- half-applied 005 cannot be silently overwritten here.
do $$
declare bad int;
begin
  select count(*) into bad
  from   todos
  where  task_date is null
     or  week_start <> task_date - (extract(isodow from task_date)::int - 1);
  if bad > 0 then
    raise exception '% row(s) inconsistent with task_date — run 005 first', bad;
  end if;
end $$;

-- Postgres cannot convert an existing column in place, so each is dropped and
-- re-added. No data is lost: both are fully derived from task_date.
alter table todos drop column week_start;
alter table todos drop column day_of_week;

alter table todos
  add column week_start date
    generated always as (task_date - (extract(isodow from task_date)::int - 1)) stored;

alter table todos
  add column day_of_week text
    generated always as (
      (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])
        [extract(isodow from task_date)::int]
    ) stored;

-- Dropping the columns dropped their indexes too.
create index if not exists idx_todos_week_start on todos (week_start);
create index if not exists idx_todos_open       on todos (week_start) where is_complete = false;

commit;

-- ----------------------------------------------------------------
-- Verify — every week_start must be a Monday, by construction now.
-- ----------------------------------------------------------------

select count(*) as non_monday_week_starts
from   todos
where  extract(isodow from week_start) <> 1;   -- expect 0

select task_date, week_start, day_of_week, title
from   todos
order  by task_date
limit  10;

-- Proof the columns are no longer writable — this must raise
-- "cannot insert into column week_start":
--
--   update todos set week_start = '2020-01-06' where id = (select id from todos limit 1);
