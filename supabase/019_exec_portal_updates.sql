-- ================================================================
-- Migration 019 — comments from the exec portal
--
-- ROLLBACK:
--   drop table if exists exec_portal_updates;
--
-- The portal feed carries recent comments on the tasks assigned to you. They
-- are not tasks and do not belong in `items`: a comment has no due date, no
-- plan and no completion, and filing it as a row would put it on the board
-- next to work. They get a small table of their own and a panel of their own.
--
-- The primary key is the feed's own id, which is what makes a re-sync an
-- upsert: the same comment arriving every night lands on the same row.
--
-- The sync tolerates this table being absent (PostgREST PGRST205) so the
-- tasks half still completes before this runs — per the PENDING_COLUMNS
-- pattern in lib/db/items.ts.
--
-- Service role only, like every other table. Nothing here is reachable from
-- the browser except through /api/dashboard behind the owner session.
--
-- Additive. Safe to re-run.
-- ================================================================

begin;

create table if not exists exec_portal_updates (
  id           uuid        primary key,
  task_id      uuid        not null,
  task_title   text        not null,
  author_name  text,
  note         text        not null,
  created_at   timestamptz not null,
  synced_at    timestamptz not null default now()
);

create index if not exists exec_portal_updates_created_idx
  on exec_portal_updates (created_at desc);

alter table exec_portal_updates enable row level security;

-- No policies: RLS on with none defined denies the anon and authenticated
-- roles entirely. The service role bypasses RLS, which is the only caller.

commit;

select count(*) as updates from exec_portal_updates;

select column_name, data_type
from   information_schema.columns
where  table_name = 'exec_portal_updates'
order  by ordinal_position;
