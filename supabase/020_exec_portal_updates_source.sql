-- ================================================================
-- Migration 020 — which portal a comment came from
--
-- ROLLBACK:
--   alter table exec_portal_updates drop column if exists source;
--
-- A second club's portal now feeds the same table. Comment ids are uuids and
-- cannot collide, so the primary key still holds; but the panel needs to say
-- which club a comment belongs to, and the sync needs to know which rows are
-- its own. Existing rows are all from the first portal.
--
-- The sync tolerates this column being absent — it drops it and retries — so
-- nothing breaks before this runs. Additive. Safe to re-run.
-- ================================================================

begin;

alter table exec_portal_updates
  add column if not exists source text not null default 'exec-portal';

create index if not exists exec_portal_updates_source_idx
  on exec_portal_updates (source, created_at desc);

commit;

select source, count(*) as comments
from   exec_portal_updates
group  by source;
