# Carry-forward notes

Things deferred out of the release they were found in, with the reason and where
they belong. Kept here so they survive the conversation they came up in.

---

## Release 5 — the `projects` table has unvalidated names

**Found during Release 1b.** The Convent root failed to merge with its portal project
because the project's name is stored as `'SMSD Convent '` — with a trailing space. An
exact-match comparison found nothing, so migration 007 silently created a duplicate root
instead of merging. The migration now compares with `btrim`, but the underlying data is
still unvalidated.

Nothing writes to `projects` today except `createProject` and `updateProject`, and neither
trims. Every project name arrives straight from a form field.

**Do this whenever the table is next touched — Release 5 rebuilds the portal, so that is
the natural moment:**

```sql
-- one-off cleanup
update projects set name = btrim(name) where name <> btrim(name);

-- and stop it recurring
alter table projects
  add constraint projects_name_trimmed check (name = btrim(name) and name <> '');
```

Trim on the way in as well, in `createProject` and `updateProject`, so the constraint is a
backstop rather than an error the user has to decipher.

**Worth widening while you are there.** The same pattern — untrimmed free text used as a
matching key — applies to:

- `contributors.name` — Release 5 rebuilds this area, and `people.name` already has a
  `lower(name)` unique index that a stray space would defeat.
- `sarkis_tasks.category` — used to join to `categories.name` in migration 007. It happens
  to be clean today; nothing enforces that.
- `tasks.title`, `subtasks.title` — not used as keys, so lower risk, but the same forms.

The class of bug is: *free text doubling as a join key, with no normalisation at either
end*. It is cheap to prevent and quiet when it happens — the Convent merge did not error,
it just silently did the wrong thing, and only a verification script caught it.

---

## Unscheduled — configurable email reminders

**Found while exporting `Sarkis Fixes` in Release 1b.** Item 5 asks for email reminders
ahead of a dated item at configurable intervals ("2 days, 1 week, fully customizable"),
plus reminders about undated tasks or whole categories on a chosen day.

No release covers this. The current digests are a fixed daily send and a fixed Sunday
recap. Release 4 rebuilds the email layer, so it either joins that release or becomes its
own. Needs a decision, not just a ticket. See [sarkis-fixes.md](sarkis-fixes.md).

---

## Unscheduled — cron hour drifts with daylight saving

**Found in Release 1a.** Vercel cron schedules are UTC only, and the Hobby plan allows one
run per job per day — so the documented fallback of running hourly and gating on Eastern
local time is not available.

The schedules are currently correct during EDT (`0 11 * * *` = 7:00 AM, `0 23 * * 0` =
Sunday 7:00 PM) and an hour early during EST. The alternatives are Vercel Pro, or flipping
the two schedules each November and March.

---

## Recovery note — what a git bundle does not contain

`scripts/backup.mjs` captures the full history, but git does not track:

- **`.env.local`** — every value except `EMAIL_FROM` is also stored in Vercel and can be
  pulled back with `vercel env pull`. `EMAIL_FROM` is set locally only; it is unused today
  because the digest path that reads it is not wired up, and Release 4 decides the real
  sending address anyway.
- **`.vercel/`** — regenerate with `vercel link`. Note the stored `repo.json` had a stale
  project name and a `"directory": "."` that Vercel rejects; the working link is a
  `project.json` holding just `projectId` and `orgId`.
- **`AUDIT.md`** — deliberately gitignored, because the repo is public.
