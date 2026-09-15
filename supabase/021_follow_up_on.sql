-- ================================================================
-- Migration 021 — a follow-up day you choose
--
-- ROLLBACK:
--   alter table items drop column if exists follow_up_on;
--
-- A teammate's portal task becomes your follow-up the day before it is due,
-- and once that day has passed it sits on Today every morning until they
-- finish it. That is the right default and the wrong behaviour the week of
-- an exam: you cannot reach out until Friday, and a reminder every day until
-- then is noise with a guilt trip attached.
--
-- This is the day you chose instead. While it is still ahead it wins; once
-- it has passed and the task is still open on the portal, the default
-- resumes. A chosen day is a deferral, not a dismissal.
--
-- Yours: the portal sync never writes it. Meaningless on rows that are not
-- someone else's portal task, and left null there.
--
-- Additive. Safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists follow_up_on date;

commit;

select column_name, data_type
from   information_schema.columns
where  table_name = 'items' and column_name = 'follow_up_on';
