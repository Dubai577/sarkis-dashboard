-- ================================================================
-- Migration 011 — pin the portal projects onto the board
--
-- ROLLBACK:
--   update items set board = 'auto'
--   where legacy_project_id is not null and parent_id is null;
--
-- These four have no children in `items` because their tasks still live in the
-- portal's own tasks/subtasks tables, so `board = 'auto'` correctly excluded
-- them. Seeing them empty is more useful than not seeing them: it keeps the
-- Release 5 decision — migrate portal tasks into the tree, or leave them —
-- visible rather than silently absent.
--
-- Safe to re-run.
-- ================================================================

begin;

-- Only the childless ones. OCCM VT and Convent also carry a legacy_project_id
-- because they were merged with a category root in 007, but they have children
-- and already reach the board on their own — pinning those would mean they
-- stayed on it even after emptying, which is not what 'auto' is for.
update items i
set    board = 'pinned', updated_at = now()
where  i.parent_id is null
  and  i.legacy_project_id is not null
  and  i.board <> 'pinned'
  and  not exists (select 1 from items c where c.parent_id = i.id);

commit;

select btrim(i.title) as project, i.board,
       (select count(*) from items c where c.parent_id = i.id) as children
from   items i
where  i.legacy_project_id is not null
order  by 1;
