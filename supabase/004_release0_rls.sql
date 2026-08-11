-- ================================================================
-- Migration 004 — Release 0: lock down the personal tables
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- RUN THIS ONLY AFTER the Release 0 application code is deployed.
-- Earlier code reads these tables directly from the browser, so applying
-- this first would leave those pages empty.
--
-- Safe to re-run.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. RLS on the four personal tables
--
-- These predate the portal and were never covered by migrations 001–003.
-- No policies are created: every legitimate reader is the service-role
-- key, which bypasses RLS.
-- ----------------------------------------------------------------

alter table public.todos        enable row level security;
alter table public.sarkis_tasks enable row level security;
alter table public.sweat_tasks  enable row level security;
alter table public.notes        enable row level security;

-- Revoke the table grants as well, so the outcome does not depend on
-- RLS alone.
revoke all on public.todos        from anon;
revoke all on public.sarkis_tasks from anon;
revoke all on public.sweat_tasks  from anon;
revoke all on public.notes        from anon;

-- ----------------------------------------------------------------
-- 2. project_summary — make the view respect RLS
--
-- A Postgres view runs with its owner's privileges unless created with
-- security_invoker, so without it this view reads past the RLS on
-- projects, tasks, project_members and project_notes.
-- ----------------------------------------------------------------

alter view public.project_summary set (security_invoker = on);

revoke all on public.project_summary from anon;

-- ----------------------------------------------------------------
-- 3. Verify
--
-- Expect: rowsecurity = true for all four, and no anon grants remaining.
-- ----------------------------------------------------------------

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('todos','sarkis_tasks','sweat_tasks','notes')
order by tablename;

select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in ('todos','sarkis_tasks','sweat_tasks','notes','project_summary');
-- ↑ should return zero rows
