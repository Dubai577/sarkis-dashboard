-- ================================================================
-- Migration 017 — how far along a thing is
--
-- ROLLBACK:
--   alter table items drop constraint if exists items_progress_check;
--   alter table items drop column if exists progress;
--
-- There has never been a progress model. `status` came across from
-- sarkis_tasks, where of 82 rows not one was ever 'Done' — finishing was
-- expressed by deleting the row — and the app repurposed it for exactly one
-- value, 'Ongoing', meaning "deliberately undated". It cannot also mean
-- "half finished" without those two ideas corrupting each other.
--
-- Three states, because a fourth is always a disguised version of one of
-- these and nobody maintains a five-state field by hand:
--
--   null           not started    the default, so no backfill and no lie
--   'in_progress'  started
--   'done'         finished
--
-- 'done' is NOT archived, and that distinction is the point. Done means you
-- finished it and want to see that you did; archived means put it away. A
-- finished task stays on the board struck through until you archive it, the
-- same way a ticked todo now stays on Today.
--
-- Additive, no backfill, safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists progress text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_progress_check') then
    alter table items add constraint items_progress_check
      check (progress is null or progress in ('in_progress', 'done'));
  end if;
end $$;

commit;

select
  coalesce(progress, 'not started') as state,
  count(*)                          as items
from   items
where  archived_at is null
group  by 1
order  by 2 desc;

select column_name, data_type
from   information_schema.columns
where  table_name = 'items' and column_name = 'progress';
