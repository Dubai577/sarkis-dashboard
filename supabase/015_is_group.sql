-- ================================================================
-- Migration 015 — a thing can be a container on purpose
--
-- ROLLBACK:
--   alter table items drop column if exists is_group;
--
-- Until now "is this a project?" was answered by counting children. That
-- reads fine on imported data, where every project already had its tasks,
-- and falls apart the moment you *make* one:
--
--   · a department created empty is indistinguishable from a task, so it
--     renders as a task and there is no way to open it and fill it — which
--     is exactly what "i listed subprojects and it listed them as tasks"
--     is describing;
--   · a real project silently demotes to a task when its last child is
--     archived, which is how the Convent root came to look like a leaf.
--
-- Intent is not derivable from content. One boolean records it.
--
-- Display still ORs the two — is_group OR has children — so nothing that
-- reads as a project today stops reading as one, whether or not the flag
-- was ever set on it.
--
-- Additive, backfilled from the current shape, safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists is_group boolean not null default false;

-- Anything that already holds something was a container in fact; say so
-- explicitly, so the flag alone is sufficient from here on. Archived
-- children count: a project whose tasks are all done is still a project.
update items p
   set is_group = true
 where is_group = false
   and exists (select 1 from items c where c.parent_id = p.id);

commit;

select
  count(*) filter (where is_group)                       as marked_groups,
  count(*) filter (where is_group and child_count = 0)   as empty_groups,
  count(*)                                               as total
from (
  select i.is_group,
         (select count(*) from items c where c.parent_id = i.id) as child_count
  from   items i
) s;

select column_name, data_type, column_default
from   information_schema.columns
where  table_name = 'items' and column_name = 'is_group';
