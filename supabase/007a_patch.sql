-- ================================================================
-- Patch 007a — completes migration 007 after two issues on the first run
--
--   1. The updated_at triggers were skipped because the trigger block could
--      not resolve update_updated_at(). The function is defined here, so this
--      file depends on nothing an earlier migration may have left behind.
--
--   2. The Convent root did not merge with the "SMSD Convent" project. That
--      project's name is stored as 'SMSD Convent ' — with a trailing space —
--      so the exact-match comparison found nothing, and step 6b then created a
--      standalone root for it instead. Comparisons now use btrim.
--
-- ORDER MATTERS BELOW. The standalone root currently holds the project's id,
-- and legacy_project_id is unique, so it has to be removed before the merge
-- can claim that id. Doing the merge first would silently do nothing.
--
-- The projects table itself is never written to.
--
-- Safe to re-run.
-- ================================================================

begin;

-- ── 1. updated_at triggers ───────────────────────────────────────

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_updated_at on items;
create trigger items_updated_at
  before update on items
  for each row execute function public.update_updated_at();

drop trigger if exists people_updated_at on people;
create trigger people_updated_at
  before update on people
  for each row execute function public.update_updated_at();

-- ── 2a. Remove the duplicate root, freeing the project id ────────
--
-- Guarded three ways: it must be a root, carry no category (so a real category
-- root can never match), and have no children. Its only content is the link
-- that step 2b re-establishes on the Convent category root, so nothing is lost.
-- Any item_people rows would cascade, and there are none on this root.

delete from items i
where  i.parent_id is null
  and  i.category_id is null
  and  btrim(i.title) = 'SMSD Convent'
  and  not exists (select 1 from items c where c.parent_id = i.id);

-- ── 2b. Merge the project into the Convent category root ─────────

update items i
set    legacy_project_id = p.id,
       updated_at = now()
from   projects p
join   categories c
  on   (btrim(p.name) = 'OCCM Virginia Tech' and c.name = 'OCCM VT')
    or (btrim(p.name) = 'SMSD Convent'       and c.name = 'Convent')
where  i.parent_id is null
  and  i.category_id = c.id
  and  i.legacy_project_id is null
  and  not exists (select 1 from items x where x.legacy_project_id = p.id);

commit;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------

-- Both category roots should now carry a project id. Expect 2 rows, merged = t.
select c.name as category, i.title, i.legacy_project_id is not null as merged
from   items i
join   categories c on c.id = i.category_id
where  i.parent_id is null
  and  c.name in ('OCCM VT', 'Convent')
order  by c.name;

-- Every project represented exactly once. Expect 5 rows, roots = 1 each.
select btrim(p.name) as project,
       (select count(*) from items i where i.legacy_project_id = p.id) as roots
from   projects p
order  by 1;

-- Roots should now be 16, not 17.
select count(*) as roots from items where parent_id is null;

-- Both triggers present. Expect items_updated_at and people_updated_at.
select tgrelid::regclass as table_name, tgname
from   pg_trigger
where  tgrelid in ('items'::regclass, 'people'::regclass)
  and  not tgisinternal
order  by 1, 2;
