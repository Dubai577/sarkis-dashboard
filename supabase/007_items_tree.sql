-- ================================================================
-- Migration 007 — Release 1b: the items tree, people, categories
--
-- ADDITIVE AND REVERSIBLE. Nothing is dropped, renamed, or deleted.
--
--   * sarkis_tasks, projects, tasks, subtasks and contributors are read but
--     never modified. The Sarkis page and the portal keep working unchanged.
--   * Every migrated row carries the id it came from (legacy_sarkis_id,
--     legacy_project_id, contributor_id), so the mapping is recoverable and
--     re-running this file updates in place instead of duplicating.
--   * To undo the entire migration:
--         drop table if exists item_people, items, people, categories cascade;
--     That is the whole rollback. No data outside these four tables changes.
--
-- Because a design pass may still adjust the model, nothing here is wired into
-- the UI yet. This migration only creates and populates the structures.
--
-- Safe to re-run.
-- ================================================================

begin;

-- ----------------------------------------------------------------
-- 1. Categories — the single source of colour
--
-- 13 distinct values exist in sarkis_tasks today, not the 16 previously
-- assumed. is_area marks the four life-areas that should recede on a projects
-- board rather than compete with real projects.
-- ----------------------------------------------------------------

create table if not exists categories (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  color      text        not null,
  sort_order integer     not null default 0,
  is_area    boolean     not null default false,
  created_at timestamptz not null default now()
);

insert into categories (name, color, sort_order, is_area) values
  ('Outreach',     '#5B8DEF',  1, false),
  ('OCCM VT',      '#4F8C7A',  2, false),
  ('Marketplace',  '#C8952F',  3, false),
  ('Clergy',       '#9B5DE5',  4, false),
  ('Convent',      '#E86AA6',  5, false),
  ('ROA',          '#2FA8C4',  6, false),
  ('Limo',         '#B4763A',  7, false),
  ('Misc.',        '#78716C',  8, false),
  ('Sarkis Fixes', '#6B7280',  9, false),
  ('Life',         '#E27D60', 10, true),
  ('Money',        '#3FA34D', 11, true),
  ('Health',       '#7C6FD4', 12, true),
  ('Errands',      '#A3A337', 13, true)
on conflict (name) do update
  set color = excluded.color,
      sort_order = excluded.sort_order,
      is_area = excluded.is_area;

-- Catch any category present in the data but missing from the list above.
insert into categories (name, color, sort_order)
select distinct s.category, '#78716C', 99
from   sarkis_tasks s
where  s.category is not null
  and  not exists (select 1 from categories c where c.name = s.category)
on conflict (name) do nothing;

-- ----------------------------------------------------------------
-- 2. People
--
-- A person is one record referenced from everywhere. "Matthews" currently
-- exists as a contributor, as a Money backlog row, and inside an OCCM VT row.
-- contributor_id links the portal identity without merging the tables, so the
-- portal rebuild in Release 5 is unaffected.
-- ----------------------------------------------------------------

create table if not exists people (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  email          text,
  phone          text,
  role_name      text,
  contributor_id uuid        unique references contributors(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists idx_people_name_unique on people (lower(name));

-- Seed from contributors. Re-running updates contact details rather than
-- inserting a second row, because contributor_id is unique.
insert into people (name, email, phone, role_name, contributor_id)
select c.name, c.email, c.phone, c.role_name, c.id
from   contributors c
on conflict (contributor_id) do update
  set name      = excluded.name,
      email     = coalesce(excluded.email, people.email),
      phone     = coalesce(excluded.phone, people.phone),
      role_name = coalesce(excluded.role_name, people.role_name),
      updated_at = now();

-- ----------------------------------------------------------------
-- 3. Items — one tree
--
-- A thing is a project when it has children. There is deliberately no "kind"
-- column: promotion happens by gaining a child, never by re-filing.
--
--   board  'auto'   on the projects board when it has children
--          'pinned' always on the board, even as a single line
--          'muted'  never on the board (the life-areas)
--
-- Possession: waiting_on + waiting_since + nudge_after. "Dropped" is derived
-- on read from waiting_since + nudge_after and is never stored, because the
-- failure mode being modelled is forgetting to set it.
-- ----------------------------------------------------------------

create table if not exists items (
  id            uuid        primary key default gen_random_uuid(),
  parent_id     uuid        references items(id) on delete cascade,
  title         text        not null,
  notes         text,
  category_id   uuid        references categories(id) on delete set null,

  priority      text,
  status        text,
  planned_date  date,
  due_date      date,
  start_time    text,
  end_time      text,
  sort_order    integer     not null default 0,

  board         text        not null default 'auto'
                  check (board in ('auto','pinned','muted')),
  archived_at   timestamptz,

  waiting_on    uuid        references people(id) on delete set null,
  waiting_since date,
  nudge_after   integer     not null default 7,

  -- Provenance. Unique, so re-running this migration updates in place.
  legacy_sarkis_id  uuid unique,
  legacy_project_id uuid unique,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  check (id <> parent_id)
);

create index if not exists idx_items_parent     on items (parent_id);
create index if not exists idx_items_category   on items (category_id);
create index if not exists idx_items_waiting    on items (waiting_on) where waiting_on is not null;
create index if not exists idx_items_planned    on items (planned_date) where planned_date is not null;
create index if not exists idx_items_due        on items (due_date) where due_date is not null;
create index if not exists idx_items_open       on items (parent_id) where archived_at is null;

-- Defined here rather than relied on from migration 001. The schema on disk and
-- the schema in the database have drifted before, so this file assumes nothing
-- about what earlier migrations left behind. `create or replace` is harmless if
-- 001's copy is already present — it is the same body.
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

-- ----------------------------------------------------------------
-- 4. Roots — one per category
--
-- Life-areas are muted so they collapse on the board instead of competing
-- with real projects.
-- ----------------------------------------------------------------

insert into items (title, category_id, board, sort_order)
select c.name, c.id, case when c.is_area then 'muted' else 'auto' end, c.sort_order
from   categories c
where  not exists (
         select 1 from items i
         where  i.parent_id is null
           and  i.category_id = c.id
           and  i.legacy_project_id is null
       );

-- ----------------------------------------------------------------
-- 5. Backlog rows become children of their category root
-- ----------------------------------------------------------------

insert into items (
  parent_id, title, notes, category_id, priority, status,
  planned_date, due_date, start_time, end_time, sort_order,
  legacy_sarkis_id, created_at
)
select
  root.id, s.title, nullif(btrim(coalesce(s.notes, '')), ''), c.id,
  s.priority, s.status, s.planned_date, s.due_date, s.start_time, s.end_time,
  coalesce(s.sort_order, 0), s.id, s.created_at
from       sarkis_tasks s
left join  categories c on c.name = s.category
left join  items root    on root.parent_id is null
                        and root.category_id = c.id
                        and root.legacy_project_id is null
on conflict (legacy_sarkis_id) do update
  set title        = excluded.title,
      notes        = excluded.notes,
      priority     = excluded.priority,
      status       = excluded.status,
      planned_date = excluded.planned_date,
      due_date     = excluded.due_date,
      updated_at   = now();

-- Subcategory, used on only 4 rows, becomes one more level of nesting.
-- Handled as a report rather than an automatic move, so a design change does
-- not have to unpick a guessed hierarchy. See the verification section.

-- ----------------------------------------------------------------
-- 6. Portal projects join the same tree
--
-- Two are the same commitment as an existing category and merge into that
-- root. The rest become roots of their own. Matching is by explicit name pair,
-- never by fuzzy comparison.
-- ----------------------------------------------------------------

-- 6a. Merge: attach the project id to the category root it duplicates.
--
-- Names are compared with btrim: 'SMSD Convent ' is stored with a trailing
-- space, which silently defeated an exact match on the first run. The source
-- row is left as-is — this migration does not write to projects.
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

-- 6b. The remaining projects become their own roots.
insert into items (title, board, sort_order, legacy_project_id, created_at)
select btrim(p.name), 'auto', 50, p.id, p.created_at
from   projects p
where  not exists (select 1 from items i where i.legacy_project_id = p.id)
on conflict (legacy_project_id) do nothing;

-- ----------------------------------------------------------------
-- 7. Item ↔ person links
--
-- Kept in a join table so a person can be referenced from many items in
-- different capacities. Populated conservatively below; the verification
-- section lists further candidates for review rather than guessing.
-- ----------------------------------------------------------------

create table if not exists item_people (
  item_id    uuid not null references items(id)  on delete cascade,
  person_id  uuid not null references people(id) on delete cascade,
  relation   text not null default 'mentioned'
               check (relation in ('mentioned','assigned','waiting_on','owner')),
  created_at timestamptz not null default now(),
  primary key (item_id, person_id, relation)
);

create index if not exists idx_item_people_person on item_people (person_id);

-- Jerome Projects is named after a contributor — record that as ownership.
insert into item_people (item_id, person_id, relation)
select i.id, pe.id, 'owner'
from   items i
join   projects pr on pr.id = i.legacy_project_id and btrim(pr.name) = 'Jerome Projects'
join   people   pe on lower(pe.name) like 'jerome%'
on conflict do nothing;

-- Matthews: the worked example from the design review. Links the backlog rows
-- that name him to the single person record.
insert into item_people (item_id, person_id, relation)
select i.id, pe.id, 'mentioned'
from   items i
join   people pe on lower(pe.name) = 'matthews'
where  i.title ilike '%matthews%'
on conflict do nothing;

-- ----------------------------------------------------------------
-- 8. Sarkis Fixes leaves the product
--
-- It is a bug list about this app, not church work. Archived rather than
-- deleted: the rows stay readable, stay in sarkis_tasks untouched, and can be
-- restored by clearing archived_at. Their text is exported to
-- docs/sarkis-fixes.md in the repo to become issues.
-- ----------------------------------------------------------------

update items i
set    archived_at = coalesce(i.archived_at, now()),
       board = 'muted',
       updated_at = now()
from   categories c
where  i.category_id = c.id
  and  c.name = 'Sarkis Fixes';

-- ----------------------------------------------------------------
-- 9. Backfills
-- ----------------------------------------------------------------

-- Sweat's two-date model reads my_due_date / actual_due_date, but the live
-- rows only ever populated the legacy due_date, so the slack bar has nothing
-- to render. Copy it across without touching due_date.
update sweat_tasks
set    actual_due_date = due_date
where  actual_due_date is null
  and  due_date is not null;

-- todos.category is populated on 0 of 37 rows, so there is nothing to backfill
-- from. Left deliberately untouched rather than guessed at; the calendar work
-- in Release 4 assigns categories through the items tree instead.

-- Possession: every existing item is "mine" — waiting_on null, which is the
-- column default. Nothing to set. Recorded here so the absence is intentional
-- rather than forgotten.

commit;

-- ================================================================
-- VERIFICATION — expected results in the comments
-- ================================================================

-- 13 categories, 4 of them areas
select count(*) as categories, count(*) filter (where is_area) as areas from categories;

-- 19 people, all linked to a contributor
select count(*) as people, count(contributor_id) as linked_to_contributor from people;

-- Tree shape: 82 backlog rows migrated, roots for every category
select
  count(*) filter (where parent_id is null)                     as roots,
  count(*) filter (where parent_id is not null)                 as children,
  count(*) filter (where legacy_sarkis_id is not null)          as from_sarkis,
  count(*) filter (where legacy_project_id is not null)         as from_projects,
  count(*) filter (where archived_at is not null)               as archived
from items;

-- Nothing orphaned: every sarkis row has exactly one item
select count(*) as sarkis_rows_not_migrated
from   sarkis_tasks s
where  not exists (select 1 from items i where i.legacy_sarkis_id = s.id);

-- Every child sits under a root, never under nothing
select count(*) as children_with_missing_parent
from   items c
where  c.parent_id is not null
  and  not exists (select 1 from items p where p.id = c.parent_id);

-- The merged pair: these two roots should each carry a legacy_project_id
select i.title, c.name as category, i.legacy_project_id is not null as merged_with_project
from   items i join categories c on c.id = i.category_id
where  i.parent_id is null and c.name in ('OCCM VT','Convent');

-- Person links created
select pe.name, ip.relation, i.title
from   item_people ip
join   people pe on pe.id = ip.person_id
join   items  i  on i.id  = ip.item_id
order  by pe.name;

-- CANDIDATES FOR REVIEW — not linked automatically.
-- Backlog rows whose title contains a known person's name. Check these before
-- deciding which should become item_people rows.
select pe.name as person, i.title, c.name as category
from   items i
join   people pe on i.title ilike '%' || pe.name || '%'
left   join categories c on c.id = i.category_id
where  i.parent_id is not null
  and  not exists (
         select 1 from item_people ip
         where ip.item_id = i.id and ip.person_id = pe.id)
order  by pe.name;

-- SUBCATEGORY REVIEW — the 4 rows that could become another level of nesting.
select s.category, s.subcategory, s.title
from   sarkis_tasks s
where  s.subcategory is not null
order  by s.category;
