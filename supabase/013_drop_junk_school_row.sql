-- ================================================================
-- Migration 013 — remove the placeholder coursework row
--
-- ROLLBACK: re-run 012, which recreates both from sweat_tasks.
--
-- 'tmw!!' / 'ye' was a placeholder typed while testing the old Sweat tab. It
-- came across in 012 because that migration moved everything faithfully rather
-- than deciding what was real.
--
-- Deleted rather than archived: archiving is for work that happened, and this
-- is not work. The source rows stay in sweat_tasks, so nothing is lost — and
-- re-running 012 would bring them back, which is why they are also excluded
-- there now.
--
-- Safe to re-run.
-- ================================================================

begin;

delete from items i
using  sweat_tasks s
where  i.legacy_sweat_id = s.id
  and  btrim(lower(s.course)) = 'tmw!!';

-- The course root, once it has no assignments left.
delete from items i
where  i.parent_id is null
  and  btrim(lower(i.title)) = 'tmw!!'
  and  i.category_id = (select id from categories where name = 'School')
  and  not exists (select 1 from items c where c.parent_id = i.id);

commit;

select i.title as course,
       (select count(*) from items c where c.parent_id = i.id) as assignments
from   items i
where  i.parent_id is null
  and  i.category_id = (select id from categories where name = 'School');
