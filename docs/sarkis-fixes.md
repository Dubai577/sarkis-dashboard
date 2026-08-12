# Sarkis Fixes — product backlog

These seven items lived in the `Sarkis Fixes` category of the task backlog. They are
requests about *this app* rather than church work, so migration `007` archives them out
of the product and records them here to become issues.

Nothing is deleted. The rows remain in `sarkis_tasks` untouched, and their copies in
`items` carry an `archived_at` timestamp — clearing it puts them back.

Two are already done, and one is half done, as a result of Releases 0 and 1a.

| # | Request | Status |
|---|---|---|
| 1 | Sort and filter by category name under the Sarkis tab. Also add a calendar tab showing everything across Sarkis, Sweat and to-dos — or put the calendar under the to-do tab. | **Partly done.** Sort and filter moved into the query in Release 1a. Calendar is Release 4. |
| 2 | Put a password on the dashboard. | **Done** — Release 0. |
| 3 | Move things between the to-do list, overdue, Sarkis and Sweat in any direction, including into a project or as a task under an existing project. Audit the whole site for places where moving isn't possible. | Open. Depends on the items tree from Release 1b, which makes all four one kind of record. |
| 4 | Category should be a dropdown with an add-new option. Same for subcategory. | Open. The `categories` table from Release 1b is the source for it. |
| 5 | See further than the current week rather than relying on Sarkis to pull items in. Add items to days far in the future. Rollover isn't moving things to the next day. Email reminders before an event at configurable intervals (2 days, 1 week, …), or a reminder about undated tasks/categories on a chosen day. | **Partly done.** Rollover, week navigation and future-week entry are Release 4. Configurable reminder intervals are not yet scheduled — see note below. |
| 6 | Get to any page from any page instead of navigating back to the home screen each time. | Open. Navigation is part of the design pass. |
| 7 | Overdue seems to pull from previous weeks — moving an item to a day in the current week makes it disappear, and it doesn't actually move until reload, then reappears under overdue. Deleting is the only thing that reliably works. | **Done** — Release 1a. The move changed `day_of_week` while leaving `week_start` in the past, so the row matched neither the week query nor the overdue query. Moves now set `task_date` and the derived columns follow. |

## Not yet on any release plan

Item 5 contains a request that no release currently covers: **configurable email reminders
ahead of a dated item** (2 days before, 1 week before, and so on), plus reminders about
undated tasks or whole categories on a chosen day. The existing digests are a fixed daily
and weekly send. Worth deciding whether this belongs in Release 4 alongside the email work
or becomes its own release.

## Source rows

| # | `sarkis_tasks.id` |
|---|---|
| 1 | `2104113c-2860-47ee-8d02-2ddba12172bb` |
| 2 | `db36b2ea-0e5a-4b83-85f5-ce366ce353fd` |
| 3 | `d677d84e-2d25-443c-a17a-a92f994b64b7` |
| 4 | `48e2fc1c-5902-4002-ae69-64c358043e89` |
| 5 | `56f91e6e-d14c-4008-9bec-35b2ce8c7e57` |
| 6 | `a3dd6036-0a73-42b6-837b-35213a31b2de` |
| 7 | `325c1bf4-e275-4f7c-bcd4-1fa63f6e0b11` |
