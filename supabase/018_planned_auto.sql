-- ================================================================
-- Migration 018 — which planned dates the app is allowed to move
--
-- ROLLBACK:
--   alter table items drop column if exists planned_auto;
--
-- Planned dates for coursework are derived from a per-class rule: the
-- Wednesday before, three days before, never a Friday or a weekend. Deriving
-- them is the point — if a class shifts its schedule, every plan should move
-- with it rather than being re-entered by hand.
--
-- But the moment the app can write a planned date, it can also overwrite the
-- one you set deliberately, and a tool that quietly undoes your decisions
-- stops being one you can rely on. This column is the difference:
--
--   true    the app derived it, and may re-derive it whenever a due date moves
--   false   you chose it, and nothing may touch it
--
-- Set false whenever a planned date is edited by hand, which the item sheet
-- and the grid both do.
--
-- Default false, so every planned date that exists today is treated as yours.
--
-- Additive, no backfill, safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists planned_auto boolean not null default false;

commit;

select
  count(*) filter (where planned_auto)                            as app_derived,
  count(*) filter (where planned_date is not null and not planned_auto) as yours,
  count(*) filter (where planned_date is null)                    as unplanned
from   items
where  archived_at is null;

select column_name, data_type, column_default
from   information_schema.columns
where  table_name = 'items' and column_name = 'planned_auto';
