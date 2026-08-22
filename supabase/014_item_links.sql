-- ================================================================
-- Migration 014 — a link on an item
--
-- ROLLBACK:
--   alter table items drop column if exists link;
--
-- Some work lives somewhere else: a website admin portal, a shared Google
-- Doc, a form. The item is the commitment; the link is where the work
-- actually happens. One nullable column rather than a table, because an
-- item has one canonical "where is this" — extra links belong in notes.
--
-- Additive. Safe to re-run.
-- ================================================================

begin;

alter table items add column if not exists link text;

-- Only http(s), and never blank. Prevents 'javascript:' and friends being
-- stored at all, so no render path has to remember to sanitise.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_link_http_check') then
    alter table items add constraint items_link_http_check
      check (link is null or link ~* '^https?://[^[:space:]]+$');
  end if;
end $$;

commit;

select count(*) as items_with_links from items where link is not null;

select column_name, data_type
from   information_schema.columns
where  table_name = 'items' and column_name = 'link';
