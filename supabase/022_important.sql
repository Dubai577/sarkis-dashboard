-- ================================================================
-- Migration 022 — does this matter?
--
-- ROLLBACK:
--   alter table items drop column if exists important;
--
-- The time matrix has two axes, urgent and important. Most software asks you
-- to set both and then both rot: "urgent" tagged three weeks ago is a lie
-- today, and nobody re-tags three hundred rows.
--
-- This app already holds urgency as a fact — the due date, which updates
-- itself every midnight for free. So only the other axis is stored. One flag,
-- set once, that cannot go stale.
--
-- Default false on purpose. Most captured things are not important, and a
-- system that assumes everything matters is the one that produced a Today
-- with forty rows on it.
--
-- Additive, no backfill. Safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists important boolean not null default false;

create index if not exists items_important_idx
  on items (important) where important and archived_at is null;

commit;

select
  count(*) filter (where important)     as marked_important,
  count(*) filter (where not important) as rest
from   items
where  archived_at is null;

select column_name, data_type, column_default
from   information_schema.columns
where  table_name = 'items' and column_name = 'important';
