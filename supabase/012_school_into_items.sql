-- ================================================================
-- Migration 012 — coursework becomes part of the one tree
--
-- ROLLBACK:
--   delete from items where legacy_sweat_id is not null;
--   delete from items where title in (select distinct btrim(course) from sweat_tasks)
--     and parent_id is null;
--   delete from categories where name = 'School';
--   alter table items drop column if exists legacy_sweat_id;
--   -- sweat_tasks is never modified, so the old tab's data is intact.
--
-- ── The two-date mapping ────────────────────────────────────────
--
-- items already carries both meanings, so no new columns are added:
--
--     sweat_tasks.my_due_date      →  items.planned_date   (when I intend to)
--     sweat_tasks.actual_due_date  →  items.due_date       (the hard deadline)
--
-- Reusing them rather than adding my_due_date/actual_due_date means the slack
-- between the two renders for EVERY item, not only coursework — a service task
-- with an intended date and a real deadline has exactly the same shape. Adding
-- school-specific columns would have duplicated the meaning and left two code
-- paths that could disagree.
--
-- ── Why one 'School' category and not one per course ────────────
--
-- Categories are the colour source and there are already 13, which is at the
-- limit of what stays distinguishable on a phone. A category per course would
-- add several every semester and never retire them. Instead: one School
-- category, one ROOT ITEM per course, assignments as its children. Per-course
-- grouping is preserved by the tree, which is what the tree is for, and a
-- finished semester is archived in one action.
--
-- Safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists legacy_sweat_id uuid unique;

insert into categories (name, color, sort_order, is_area)
values ('School', '#C4643F', 14, false)
on conflict (name) do update set color = excluded.color;

-- ── One root per course ─────────────────────────────────────────

insert into items (title, category_id, board, sort_order)
select distinct
       btrim(s.course),
       (select id from categories where name = 'School'),
       'auto',
       60
from   sweat_tasks s
where  btrim(coalesce(s.course, '')) <> ''
  and  btrim(lower(s.course)) <> 'tmw!!'   -- placeholder, removed in 013
  and  not exists (
         select 1 from items i
         where  i.parent_id is null
           and  lower(btrim(i.title)) = lower(btrim(s.course))
           and  i.category_id = (select id from categories where name = 'School')
       );

-- ── Assignments become children of their course ─────────────────

insert into items (
  parent_id, title, category_id, planned_date, due_date,
  start_time, end_time, status, legacy_sweat_id, archived_at, created_at
)
select
  course.id,
  s.title,
  (select id from categories where name = 'School'),
  s.my_due_date,                                  -- when I intend to
  coalesce(s.actual_due_date, s.due_date),        -- the real deadline
  s.start_time,
  s.end_time,
  case when s.is_complete then 'Done' else 'Working on it' end,
  s.id,
  -- Completed coursework arrives already archived: it is history, not backlog.
  case when s.is_complete then coalesce(s.created_at, now()) else null end,
  coalesce(s.created_at, now())
from       sweat_tasks s
left join  items course
       on  course.parent_id is null
      and  lower(btrim(course.title)) = lower(btrim(s.course))
      and  course.category_id = (select id from categories where name = 'School')
where      course.id is not null
  and      btrim(lower(s.course)) <> 'tmw!!'   -- placeholder, removed in 013
on conflict (legacy_sweat_id) do update
  set title        = excluded.title,
      planned_date = excluded.planned_date,
      due_date     = excluded.due_date,
      updated_at   = now();

commit;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------

-- Every real sweat row has exactly one item. Expect 0.
-- The 'tmw!!' placeholder is excluded on purpose; see 013.
select count(*) as not_migrated
from   sweat_tasks s
where  btrim(lower(s.course)) <> 'tmw!!'
  and  not exists (select 1 from items i where i.legacy_sweat_id = s.id);

-- Course roots and their assignment counts.
select i.title as course,
       (select count(*) from items c where c.parent_id = i.id) as assignments
from   items i
where  i.parent_id is null
  and  i.category_id = (select id from categories where name = 'School')
order  by 1;

-- The two-date model survived the move.
select i.title, i.planned_date as mine, i.due_date as real_deadline,
       i.due_date - i.planned_date as slack_days
from   items i
where  i.legacy_sweat_id is not null
order  by i.due_date nulls last;
