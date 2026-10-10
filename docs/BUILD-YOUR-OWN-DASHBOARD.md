# Build a personal life dashboard

**Paste this whole file into a Claude chat as your first message.** Then say:
*"Build this with me, one phase at a time. I have no coding experience —
explain what I need to click, and don't move to the next phase until the
current one works."*

This is a complete spec for a private, single-user web dashboard: one page
that shows everything you're responsible for, on any device, kept current
automatically. It's based on a working app that's been in daily use. The
"Lessons" at the end are real bugs that cost real time — they're the most
valuable part of this document.

---

## 0. What you're building, in one paragraph

A website only you can log into. It holds everything you have to do — study,
work, church, errands, personal projects — in one tree you can see at a
glance. Every task can have a **planned date** (when you mean to do it) and a
**due date** (when it's actually owed), and the gap between them is your
breathing room. Unfinished work rolls forward instead of disappearing. You get
an email each morning and a push notification on your phone for reminders. It
costs nothing to run.

---

## 1. The stack (all free tiers, no credit card)

| Piece | What it is | Why |
|---|---|---|
| **Next.js** (App Router, TypeScript) | The website framework | One project holds both the pages and the server code |
| **Supabase** | Postgres database + auth | Free tier is generous; its SQL editor is where you'll run migrations |
| **Vercel** | Hosting | Deploys automatically when you push to GitHub; runs scheduled jobs |
| **GitHub** | Code storage | Vercel watches it; also your backup |
| **Tailwind CSS v4** | Styling | Lets Claude write consistent UI without separate stylesheets |
| **Resend** | Sending email | Free tier, simple API |

**Accounts to create first:** GitHub, Supabase, Vercel, Resend. Sign into all
four with the *same* email to save yourself pain later.

> ⚠️ **Vercel free tier caps scheduled jobs at once per day each.** Anything
> more frequent fails at deploy time with a confusing error. Design around
> daily jobs; use "refresh when the page opens" for anything that needs to feel
> live. (See Lesson 7.)

---

## 2. The one idea that makes this work

**Everything is one tree.** Not separate tables for projects, sub-projects and
tasks — a single `items` table where each row can point at a parent.

```
Car                       ← no parent: a project
  Maintenance             ← parent = Car: a sub-project
    Oil change            ← parent = Maintenance: a task
    Replace wipers
  Registration renewal    ← a task sitting directly on the project
Church
  Bookstore
    Order prayer ropes
```

A row is a **project** if nothing is above it. It's a **container** if things
sit under it. It's a **task** if it's a leaf. Same table, same editor, same
everything — so a task can become a project just by gaining children, and you
never have to decide upfront what something "is".

> **Tell Claude:** "Use one `items` table with a `parent_id` column, not
> separate tables for projects and tasks."

---

## 3. Database schema

Give Claude this as the starting shape. You'll run it in Supabase's SQL editor.

```sql
-- Everything you're responsible for: projects, sub-projects, tasks.
create table items (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references items(id) on delete cascade,
  title         text not null,
  notes         text,

  -- The two dates, deliberately separate.
  planned_date  date,          -- when you mean to do it
  due_date      date,          -- when it is actually owed

  -- Is this a container on purpose? (See Lesson 2.)
  is_group      boolean not null default false,

  progress      text check (progress is null or progress in ('in_progress','done')),
  priority      text check (priority is null or priority in ('Urgent','Soon','Whenever')),

  -- "Reaching out": who you're waiting on, and since when.
  waiting_on    uuid references people(id),
  waiting_since date,
  nudge_after   integer default 5,   -- days before it counts as dropped

  link          text,          -- where the work actually happens
  sort_order    integer not null default 0,
  archived_at   timestamptz,   -- archive, never delete
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- People you wait on or assign to.
create table people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  notes      text,
  created_at timestamptz not null default now()
);

-- One row per task per day it appears on your calendar.
-- This is what rollover moves and what you tick off.
create table todos (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  task_date      date not null,
  is_complete    boolean not null default false,
  completed_at   timestamptz,
  source_item_id uuid references items(id) on delete cascade,
  origin_date    date,            -- the day it was FIRST meant for
  roll_count     integer default 0,
  placement      text default 'auto',  -- 'auto' = app put it here, 'manual' = you did
  sort_order     integer not null default 0
);

-- Free-text capture: thoughts that aren't tasks yet.
create table notes (
  id         uuid primary key default gen_random_uuid(),
  content    text not null,
  created_at timestamptz not null default now()
);
```

**Security — do not skip this.** Turn on Row Level Security for every table and
add **no policies**. With RLS on and nothing defined, the public key that ships
in your website's JavaScript can read nothing. All database access goes through
your own server code using the secret service-role key.

```sql
alter table items  enable row level security;
alter table people enable row level security;
alter table todos  enable row level security;
alter table notes  enable row level security;
-- No policies. The service role bypasses RLS; nothing else gets in.
```

> **Tell Claude:** "Enable RLS with no policies on every table. All reads and
> writes go through Next.js route handlers using the service-role key, never
> from the browser."

---

## 4. Features — core

### 4.1 The home page: Today, This week, everything

One screen, three bands:

- **Late** — anything overdue, oldest first, each saying how many days behind.
  This goes at the *top*. The most urgent thing you own should not be the
  hardest thing to find.
- **Today** — what's planned for today, plus anything due today.
- **This week / Next week** — the rest of this week grouped by day, then all of
  next week. ("This week" always means *from tomorrow*. See Lesson 6.)
- **All work** — every project with its sub-projects and tasks nested inside.

Sort controls that apply inside each day: **by deadline · by priority · by
project · by name**, plus a reverse toggle and a filter to show one area of
life at a time.

### 4.2 Planned date vs due date

The single most useful idea in the whole app.

- **Due date** — the real deadline. Often set by someone else.
- **Planned date** — the day you intend to do it. Always *before* the due date.

The gap is your slack. If you only track deadlines, every day feels like an
emergency. **Rule: a planned date must never equal its due date.** Claude
should enforce that in code, not hope for it.

### 4.3 Rollover

If a task planned for Tuesday isn't done, it moves to Wednesday. One day at a
time — never jumping straight to today, because the walk is what makes
"4 days late" visible. Store `origin_date` and `roll_count` so the row can say
*"planned 4 days ago, due in 2"* instead of silently pretending it was always
for today.

### 4.4 Progress and priority

- **Progress**: *Not started · In progress · Done.* Three states — a fourth is
  always a disguised version of one of these.
- **Priority**: *Urgent · Soon · Whenever.*
- **Progress bar**: for a project, the percentage of its tasks that are done.
  Render it as a thin bar under the project name, and as a ring on the compact
  card view.
- **Done is not archived.** Done means you finished it and want to see that you
  did — it stays visible, struck through, until you archive it.

### 4.5 Archive, never delete

Nothing is ever destroyed. `archived_at` hides it; an Archive page brings it
back. Archiving a project archives everything under it — and restoring it
restores them too.

> **Tell Claude:** "Add an Undo bar after any archive action, and make the
> archive button say what it will take with it: *'Archive Car and the 6 under
> it'*." (See Lesson 3.)

### 4.6 Reaching out (waiting on people)

A `people` table, and any task can be marked *waiting on* someone with a
`waiting_since` date. The app then computes three states:

- **mine** — nobody else is blocking it
- **theirs** — you're waiting, and it hasn't been long
- **dropped** — you've been waiting longer than `nudge_after` days

**Never store "dropped" in the database — compute it on read.** A stored flag
goes stale the moment a day passes.

A **People** page lists everyone with what you're waiting on from each, so
before you text someone you can see everything outstanding with them at once.

### 4.7 The grid (spreadsheet view)

A dense table of every item where **every cell is editable in place** — name,
parent, priority, progress, planned, due. No dialogs. Sort by any column,
filter across the whole tree, select many rows and move or re-rank them
together, add a row by typing in the blank one at the bottom.

This matters more than it sounds. Organising a hundred things is a completely
different job from working through them, and a spreadsheet beats a pretty card
UI at it every time.

### 4.8 Compact board

A grid of small cards, one per project, each showing: open count, late count,
next due date, number of sub-projects, progress ring. **All your projects on
one screen**, tap to drill in. The detailed board is for working; this is for
seeing everything at once.

### 4.9 Calendar

Month / week / day. Crucially, a **Show: Plan · Deadlines · Both** toggle.
Every item has two dates, so drawing both puts every task on the calendar
twice. Default to **Plan** — show planned dates, and fall back to the due date
only for things with no plan of their own.

### 4.10 Quick capture

A **+** button on every screen. One text field, focused immediately, saves on
Enter. Choose: **Project · Task · A day · Note**. Never make it ask what kind
of thing something is before letting you type — that question at the moment of
capture is exactly what stops things getting captured.

### 4.11 Notes & important info

- **Notes** — free-text capture for things that aren't tasks yet.
- **Important info / quick copy-paste** — a page of labelled snippets with a
  copy button on each: Wi-Fi password, church EIN, insurance policy number,
  a bank's mailing address, your standard email signature. A `snippets` table
  with `label`, `value`, `category`, and a one-click copy.

```sql
create table snippets (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  value      text not null,
  category   text,
  is_secret  boolean not null default false,  -- blur until clicked
  sort_order integer not null default 0
);
```

---

## 5. Features — the specific ones you asked for

### 5.1 Phone notifications (Web Push / VAPID)

You're thinking of **VAPID** — it's the standard behind browser push
notifications, and it's free. No App Store, no Apple developer account.

How it works: your site asks permission, the browser hands back a
"subscription", you store it, and a scheduled job sends pushes to it.

```sql
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table reminders (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid references items(id) on delete cascade,
  remind_at  timestamptz not null,
  sent_at    timestamptz,
  message    text
);
```

> ⚠️ **The iPhone catch, and it's a big one.** iOS only delivers web push if
> the site is **added to the Home Screen** first. Open the site in Safari →
> Share → *Add to Home Screen* → open it from that icon → *then* allow
> notifications. It will not work from a Safari tab, ever. Requires iOS 16.4+.
>
> This also means your site must be a **PWA**: it needs a `manifest.json` and
> a service worker. Tell Claude to set that up — it's about 30 lines.

> **Tell Claude:** "Set up Web Push with the `web-push` npm package. Generate
> VAPID keys, add a manifest.json and a service worker, store subscriptions in
> Supabase, and add a daily cron that sends reminders due in the next 24 hours.
> Walk me through adding the site to my iPhone Home Screen."

### 5.2 Car mileage log

```sql
create table vehicles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,           -- "Civic"
  plate         text,
  notes         text
);

create table mileage_entries (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references vehicles(id) on delete cascade,
  logged_on     date not null,
  odometer      integer not null,        -- the reading, not the trip
  purpose       text,                    -- "church visit", "commute"
  is_deductible boolean not null default false,
  notes         text
);
```

Store the **odometer reading**, not the trip distance — trips are then derived
by subtracting the previous entry, and a missed entry can't silently corrupt
your running total. Show: current odometer, miles this month, deductible miles
this year (useful at tax time), and miles between any two dates.

**Tie it to the tasks:** an oil change task can live under `Car → Maintenance`
with a due date, while the mileage log tells you whether you're actually near
the interval.

### 5.3 Prayer rope orders

This is a small order-tracking system — the same shape works for any craft or
side business.

```sql
create table orders (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid references people(id),
  customer_name  text,                   -- if they're not in `people`
  item_type      text not null,          -- "33-knot", "100-knot", "chotki"
  quantity       integer not null default 1,
  colour         text,
  notes          text,                   -- special requests
  status         text not null default 'requested'
                 check (status in ('requested','in_progress','ready','delivered')),
  requested_on   date not null default current_date,
  promised_by    date,
  delivered_on   date,
  price          numeric(10,2),
  is_paid        boolean not null default false
);
```

A board with four columns — **Requested → In progress → Ready → Delivered** —
and a count on each. An order with a `promised_by` date **creates a task in
your main tree automatically**, so it shows up on Today like everything else
rather than living in its own forgotten corner.

### 5.4 Books read

```sql
create table books (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  author       text,
  status       text not null default 'to_read'
               check (status in ('to_read','reading','finished','abandoned')),
  started_on   date,
  finished_on  date,
  total_pages  integer,
  current_page integer,
  rating       integer check (rating between 1 and 5),
  notes        text,                      -- what you took from it
  is_spiritual boolean not null default false
);
```

Shows: currently reading with a **progress bar** (`current_page / total_pages`),
finished this year with a count, and a to-read list. *Abandoned* is a real
status on purpose — pretending you'll finish a book you stopped six months ago
is how a reading list becomes a guilt list.

---

## 6. Features — automation

### 6.1 Morning email

One email, 8am, showing exactly what the home page shows, in the same order:

- **Late** — with how many days behind
- **Today** — with due-in and which project
- **Rest of the week** — grouped by day

Keep it **light-themed, one column, 560px wide**. It's read on a phone.
Resend's free tier covers this easily.

> ⚠️ Resend will only deliver to your *own* account email until you verify a
> domain you own. If you don't own a domain, set the recipient to the email
> you signed up to Resend with and it works immediately.

### 6.2 Evening urgent email

8pm: what's due tonight and still not done. **Send nothing when there's nothing
outstanding.** A nightly email that mostly says "all clear" trains you to stop
opening it — and then the night it matters, it goes unread with the rest.

### 6.3 Importing a calendar you don't control

If you have a school or work calendar published as an `.ics` feed, the app can
read it on a schedule and turn each event into a task filed under the right
project.

The rule that makes this safe: **decide who owns which field.**

| The feed owns | You own |
|---|---|
| title, due date, which project it belongs under | planned date, priority, notes, archived |

Match rows on the feed's own ID so re-syncing updates rather than duplicates.
And if the fetch fails — **throw an error, never treat it as "zero tasks"**, or
the sync will look like everything was deleted.

### 6.4 Publishing your own calendar

Your app can publish its own `.ics` feed that Google Calendar subscribes to, so
your tasks appear beside your real appointments. Guard it with a long random
token in the URL, since Google can't log in.

> Be realistic: Google re-checks an external calendar every few **hours**, not
> minutes. It's for seeing your week beside your meetings, not for live updates.

---

## 7. Lessons — read these before you start

These are real bugs from the working version. Each one cost hours.

**1. Never let the browser talk to the database directly.** RLS on with no
policies, every read and write through your own server code. The "public" key
that ships in your JavaScript is readable by anyone who opens dev tools.

**2. "Is this a project?" cannot be answered by counting children.** If you
decide something is a project because it *has* tasks, then a brand-new empty
sub-project is indistinguishable from a task — you can't open it or put
anything in it — and a real project silently demotes itself when its last task
is archived. Store the intent in an `is_group` column; show it as a container
if `is_group` **or** it has children.

**3. One unconfirmed click should not be able to lose work.** An archive button
at the end of a row, with no confirmation and no undo, archived a whole project
and its six sub-projects in one misclick. Always: say what it will take, and
offer an Undo.

**4. Dates are strings, and they belong in one file.** Use `YYYY-MM-DD` text
and compare with `<` and `>`. Put every date calculation in one module pinned
to your timezone. A date built in the browser's local time will land on the
wrong day for someone, eventually — usually at 11pm.

**5. Never delete rows by a pattern.** `DELETE WHERE title LIKE '%test_%'` —
`_` is a single-character wildcard in SQL, and that query destroyed four real
records. Delete by explicit ID, always.

**6. Off-by-one windows hide until exactly the wrong day.** "The rest of this
week" started at the week's first day — so every *Monday*, today's tasks
appeared twice. It was correct Tuesday through Sunday. Test date logic on the
boundary days.

**7. Check the free tier's limits before designing around a schedule.** A
scheduled job set to run hourly caused *every deployment to fail silently* for
days. Nothing errored visibly; builds just stopped happening. Vercel's free
tier is once-per-day per job.

**8. When something saves but nothing changes on screen, suspect two copies.**
A task that appears both in a "today" list and an "overdue" list needs both
updated when you tick it, or the row you just clicked won't react.

**9. Have the app tell you when it fails.** A morning email failed every day
for a month because the sender address wasn't verified — and the code treated
the failure as success. If a scheduled job can fail, make it report the reason.

**10. Back up before any bulk change.** A script that writes to many rows at
once should be preceded by a database export. Supabase makes this one click.

---

## 8. Build order

Don't try to build it all at once. Each phase should work before you start the
next.

| Phase | What | Why this order |
|---|---|---|
| **1** | Next.js app, deployed to Vercel, Supabase connected, password login | Get *something* live on day one |
| **2** | `items` table, add/edit/list, the tree | The core. Everything else hangs off it |
| **3** | Dates: planned vs due, Today, rollover | Where it starts being useful |
| **4** | Projects board, progress bars, priority | Shape |
| **5** | Grid view | Where you'll do your actual organising |
| **6** | People, waiting-on, reaching out | |
| **7** | Notes + snippets | Quick wins, low risk |
| **8** | Calendar + published `.ics` | |
| **9** | Morning + evening email | |
| **10** | Push notifications (PWA + VAPID) | Fiddliest — do it once everything else is solid |
| **11** | Mileage, orders, books | Self-contained; add whenever |

---

## 9. How to work with Claude on this

**Ask for the plan before the code.** *"Before writing anything, tell me what
you're going to change and why."*

**One phase at a time.** A 500-line change you can't read is a 500-line change
you can't fix.

**Ask it to explain in plain English.** You're not pretending to be an
engineer; you're the person who decides whether it's right. *"Explain what this
does as if I've never seen code."*

**Make it prove things work.** *"Don't tell me it works — show me the output."*

**When something's wrong, describe the symptom, not your guess at the cause.**
*"I ticked a task and it didn't go away"* is more useful than *"I think the
database isn't saving."*

**Say when you don't understand.** Every time you nod along at something
confusing, you lose the ability to catch a mistake later.

**Migrations:** Claude writes `.sql` files; you paste them into Supabase's SQL
editor and run them. Ask for the SQL in the chat directly — it's faster than
hunting for files. Number them `001_`, `002_` and keep them forever.

---

## 10. First message to send Claude

> I want to build a personal dashboard. I've pasted the full spec above. I have
> no coding experience. Set me up with Phase 1 only: a Next.js app with
> TypeScript and Tailwind, connected to Supabase, with a simple password login,
> deployed to Vercel through GitHub.
>
> Walk me through every account I need to create and every button I need to
> click. Don't assume I know what anything means. Stop after Phase 1 and we'll
> test it together before going further.

---

*Costs nothing on free tiers. Expect Phase 1 to take an evening and the whole
thing to take a few weeks of evenings. The grid view and the planned-vs-due
distinction are the two things that make it worth having — if you build nothing
else, build those.*
