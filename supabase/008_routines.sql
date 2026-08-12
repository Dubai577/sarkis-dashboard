-- ================================================================
-- Migration 008 — Release 2: routines move out of localStorage
--
-- ROLLBACK:
--   drop table if exists routine_checks, routines cascade;
--
-- Routines are not tasks: fixed recurring personal items with fixed
-- frequencies. They get their own strip on Today rather than a slot in the
-- task list.
--
-- Nothing is imported from localStorage. It is per-device, it was keyed by a
-- week_start computed with the timezone bug fixed in Release 1a, and the keys
-- therefore point at the wrong week for anything entered after ~8 PM Eastern.
-- Starting clean is more honest than importing wrong data.
--
-- Checks are keyed by an absolute date rather than (week, day name), so this
-- table cannot inherit that class of bug.
--
-- Safe to re-run.
-- ================================================================

begin;

create table if not exists routines (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  cadence     text        not null
                check (cadence in ('daily','alternating','weekly_on')),
  -- weekly_on: 0 = Monday … 6 = Sunday, matching lib/dates dayIndex()
  weekday     integer     check (weekday is null or weekday between 0 and 6),
  -- alternating: every other day counted from this date
  anchor_date date,
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),

  check (cadence <> 'weekly_on'   or weekday is not null),
  check (cadence <> 'alternating' or anchor_date is not null)
);

create table if not exists routine_checks (
  routine_id uuid        not null references routines(id) on delete cascade,
  check_date date        not null,
  checked_at timestamptz not null default now(),
  primary key (routine_id, check_date)
);

create index if not exists idx_routine_checks_date on routine_checks (check_date);

-- The seven current routines. 2026-01-05 is a Monday, used as the alternating
-- anchor so "every other day" is stable and reproducible rather than derived
-- from a day index that resets each week.
insert into routines (name, cadence, weekday, anchor_date, sort_order) values
  ('Intro to Agbeya',      'daily',       null, null,         1),
  ('Coptic Reader Liturgy','daily',       null, null,         2),
  ('Mesalamine',           'daily',       null, null,         3),
  ('Omeprazole',           'daily',       null, null,         4),
  ('End of Agbeya',        'daily',       null, null,         5),
  ('Sermon or Bible Study','alternating', null, '2026-01-05', 6),
  ('Dupixent',             'weekly_on',   2,    null,         7)
on conflict (name) do update
  set cadence     = excluded.cadence,
      weekday     = excluded.weekday,
      anchor_date = excluded.anchor_date,
      sort_order  = excluded.sort_order;

alter table routines       enable row level security;
alter table routine_checks enable row level security;

revoke all on routines       from anon;
revoke all on routine_checks from anon;

commit;

-- ----------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------

-- 7 routines: 5 daily, 1 alternating, 1 weekly_on (Wednesday = weekday 2)
select cadence, count(*) from routines group by cadence order by 1;

select name, cadence, weekday, anchor_date from routines order by sort_order;

-- RLS on, no anon grants
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('routines','routine_checks');

select count(*) as anon_grants
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
  and table_name in ('routines','routine_checks');   -- expect 0
