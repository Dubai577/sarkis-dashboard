-- ================================================================
-- Migration 016 — items that come from somewhere else
--
-- ROLLBACK:
--   drop index if exists items_external_uid_key;
--   alter table items drop column if exists external_uid;
--   alter table items drop column if exists external_source;
--   alter table items drop column if exists external_synced_at;
--
-- Canvas coursework has to land in the tree — under VT, under its class —
-- so it can be planned, prioritised and ticked off like anything else. But
-- Canvas remains the author of the assignment: if a due date moves there, it
-- must move here, and a second sync must not create a second row.
--
-- external_uid is the feed's own UID for the event. It is what makes a sync
-- an upsert rather than an import. The unique index is partial, because every
-- hand-made row has no uid and NULLs must not collide.
--
-- The split of ownership is deliberate and is enforced in the sync, not here:
--
--   Canvas owns   title, due_date, which class it sits under
--   you own       planned_date, priority, notes, archived_at
--
-- so re-syncing never erases the fact that you meant to start something on
-- Tuesday, and never resurrects something you archived.
--
-- Additive. Safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists external_uid text;
alter table items add column if not exists external_source text;
alter table items add column if not exists external_synced_at timestamptz;

create unique index if not exists items_external_uid_key
  on items (external_uid)
  where external_uid is not null;

commit;

select
  count(*) filter (where external_uid is not null) as synced_rows,
  count(*)                                         as total
from items;

select column_name, data_type
from   information_schema.columns
where  table_name = 'items'
  and  column_name in ('external_uid', 'external_source', 'external_synced_at')
order  by column_name;
