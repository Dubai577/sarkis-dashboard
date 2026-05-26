# Project Portal — Setup Guide

## 1. Run the migration

Open **Supabase Dashboard → SQL Editor → New query**, paste the contents of
`supabase/migrations/001_project_portal.sql`, and run it.

This creates all tables, indexes, triggers, RLS policies, and the pgcrypto PIN
verification function in one shot.

---

## 2. Add environment variables

Add these to `.env.local` (and to Vercel → Settings → Environment Variables):

```
NEXT_PUBLIC_SUPABASE_URL=         # from Supabase → Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # from Supabase → Settings → API
SUPABASE_SERVICE_ROLE_KEY=        # from Supabase → Settings → API (secret)

RESEND_API_KEY=                   # from resend.com
EMAIL_FROM=tasks@yourdomain.com   # verified sender domain in Resend

ADMIN_EMAIL=you@yourdomain.com    # where admin digests are sent
NEXT_PUBLIC_APP_URL=https://sarkis-dashboard.vercel.app

CRON_SECRET=some-random-string    # protects the cron endpoint in production
```

---

## 3. Install packages (if not already present)

```bash
npm install @supabase/supabase-js @supabase/ssr resend
```

---

## 4. Add the Vercel cron

Add or update `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/notify",
      "schedule": "0 0 * * *"
    }
  ]
}
```

---

## 5. Drop the files into your repo

```
lib/
  types/portal.ts
  supabase/admin.ts
  supabase/server.ts       ← merge with your existing server.ts if one exists
  email/notify.ts

components/
  projects/ProjectCard.tsx

app/
  (admin)/projects/
    page.tsx
    [id]/page.tsx
  portal/
    page.tsx               ← PIN entry
    dashboard/
      page.tsx             ← contributor task list (server)
      TaskList.tsx         ← interactive client component
  api/
    portal/
      auth/route.ts
      tasks/[id]/route.ts
      tasks/[id]/updates/route.ts
      prefs/route.ts
    cron/
      notify/route.ts
```

---

## 6. Create contributors

For each person, run this in the Supabase SQL Editor (replace values):

```sql
INSERT INTO contributors (name, email, pin_hash, notif_frequency)
VALUES (
  'Mary Girgis',
  'mary@example.com',
  crypt('482910', gen_salt('bf')),   -- their 6-digit PIN
  'weekly'
);
```

Keep a separate record of each contributor's PIN — you share it with them over
WhatsApp. They use it at `/portal` to access their tasks.

To get a contributor's magic link (skip PIN entry):

```sql
SELECT '/portal?t=' || access_token::text FROM contributors WHERE name = 'Mary Girgis';
```

Then set up `/portal?t=[token]` as an auto-login in `app/portal/page.tsx`
(check `searchParams.t`, call `/api/portal/auth/token`, redirect to dashboard).

---

## 7. Admin authentication

The `/projects` route group currently has no auth guard. Add one that matches
your existing auth system. Quick option — middleware:

```ts
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // Protect admin routes — adjust to your existing auth cookie/session
  if (req.nextUrl.pathname.startsWith('/projects')) {
    const session = req.cookies.get('your-admin-session-cookie')
    if (!session) return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/projects/:path*'],
}
```

---

## 8. Test the flow end-to-end

1. Go to `/projects` — you should see the empty dashboard.
2. Create a project via the SQL editor or build the `/projects/new` form.
3. Create a contributor and a task assignment.
4. Go to `/portal`, enter the PIN → should land on the dashboard with the task.
5. Mark a task complete → check `admin_notifications` in Supabase.
6. Trigger the cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/cron/notify`

---

## Next to build

- `/projects/new` — create project form  
- `/projects/[id]/tasks/new` — create task form  
- `/projects/[id]/tasks/[taskId]/assign` — assign contributor to task  
- `/projects/contributors` — list + create contributors  
- `/projects/notifications` — full notification feed with mark-as-read  
- `/portal?t=[token]` — magic link auto-login  

Share your 10 projects and I can help seed the initial data.
