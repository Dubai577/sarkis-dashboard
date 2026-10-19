'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PencilIcon } from '@/components/ui/Icon'
import { mediumLabel, today as todayIso } from '@/lib/dates'
import {
  PENDING, QUADRANTS, isPending, laneOf, readOnDo, URGENT_WITHIN, type Lane,
} from '@/lib/focus'

/**
 * The time matrix, as a working surface rather than a diagram.
 *
 * A four-box picture is a nice explanation and a poor tool. What makes the
 * matrix useful is that each quadrant has a different verb, so this is four
 * lists with four different buttons — not one list sorted four ways.
 *
 * Everything here writes straight to the item. There is no separate "matrix
 * state" to drift from the task.
 */

interface Row {
  id: string
  title: string
  parent_id: string | null
  due_date: string | null
  planned_date: string | null
  important: boolean | null
  progress: string | null
  waiting_on: string | null
  waiting_since: string | null
  is_group_view?: boolean
  child_count: number
  archived_at?: string | null
}

export function Focus() {
  const [rows, setRows] = useState<Row[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Lane>('do')
  const [busy, setBusy] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  /**
   * The how-to opens by itself until something has been starred.
   *
   * A manual nobody can find is a manual nobody reads, and the moment it is
   * needed is the first time — before a single judgement has been made. Once
   * work is marked, it folds away and stays where it can be reopened.
   */
  const [howOpen, setHowOpen] = useState<boolean | null>(null)
  const now = todayIso()

  const load = useCallback(async () => {
    const [i, p] = await Promise.all([
      fetch('/api/items').then(r => (r.ok ? r.json() : { items: [] })),
      fetch('/api/people').then(r => (r.ok ? r.json() : { people: [] })),
    ])
    setRows(i.items ?? [])
    setPeople(p.people ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])

  /** Only leaves: a project is not a task, and counting it twice is noise. */
  const leaves = useMemo(() => {
    const holds = new Set(rows.map(r => r.parent_id).filter(Boolean) as string[])
    return rows.filter(r =>
      r.parent_id && !r.is_group_view && !holds.has(r.id) && r.progress !== 'done')
  }, [rows])

  const buckets = useMemo(() => {
    const out: Record<Lane, Row[]> =
      { do: [], schedule: [], delegate: [], drop: [], pending: [] }
    for (const r of leaves) out[laneOf(r, now)].push(r)
    const order = (a: Row, b: Row) =>
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.title.localeCompare(b.title)
    for (const k of Object.keys(out) as Lane[]) out[k].sort(order)
    return out
  }, [leaves, now])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await load()
      setPicking(null)
    } finally {
      setBusy(null)
    }
  }

  async function archive(id: string) {
    setBusy(id)
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const where = (r: Row) => (r.parent_id ? byId.get(r.parent_id)?.title ?? '' : '')

  /** Tomorrow, then the next weekdays by name — the Schedule verb. */
  const quickDays = useMemo(() => {
    const out: { date: string; label: string }[] = []
    for (let i = 1; i <= 9 && out.length < 5; i++) {
      const d = new Date(`${now}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() + i)
      const iso = d.toISOString().slice(0, 10)
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue
      out.push({ date: iso, label: i === 1 ? 'Tomorrow' : mediumLabel(iso) })
    }
    return out
  }, [now])

  if (loading) return <p className="p-4 text-[12px] text-ink-3">Loading…</p>

  const anyStarred = rows.some(r => r.important)
  const showHow = howOpen ?? !anyStarred

  const meta = tab === 'pending' ? PENDING : QUADRANTS.find(q => q.key === tab)!
  const list = buckets[tab]
  const note = readOnDo(buckets.do.length, buckets.schedule.length)

  return (
    <div className="mx-auto max-w-3xl px-3 py-4">
      <h1 className="text-lg font-semibold">Focus</h1>
      <p className="mb-3 text-[12px] leading-snug text-ink-2">
        Urgency is read from the deadline — late, or due within {URGENT_WITHIN} days — so it is
        never out of date. Importance is the one thing only you can say.
      </p>

      {/*
        ── how to decide ──

        Urgency the app works out; importance it cannot. So this explains the
        one judgement being asked for, in the terms the matrix itself uses,
        with the test that actually settles it: not "is this big" but "what
        would it cost me if it never happened".
      */}
      <section className="mb-3 rounded-xl border border-line/50 bg-surface-2">
        <button
          onClick={() => setHowOpen(!showHow)}
          className="flex w-full items-baseline gap-2 px-3 py-2 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
            How to decide
          </span>
          <span className="text-[10px] text-ink-3">urgent vs important</span>
          <span className="ml-auto text-[10px] text-mine">{showHow ? 'hide' : 'show'}</span>
        </button>

        {showHow && (
          <div className="border-t border-line/60 px-3 py-2.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <h3 className="text-[11.5px] font-semibold text-ink">
                  Urgent <span className="font-normal text-ink-3">— worked out for you</span>
                </h3>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-2">
                  A deadline close enough to bite: late, or due within {URGENT_WITHIN} days.
                  Read from the due date, so it is never out of date and you never set it.
                </p>
                <p className="mt-1.5 rounded-md bg-surface px-2 py-1.5 text-[11px] leading-snug text-ink-2">
                  <span className="font-medium">The test:</span> if I do not do this by then,
                  what actually happens? If you can name the consequence and it has a date,
                  it is urgent.
                </p>
              </div>

              <div>
                <h3 className="text-[11.5px] font-semibold text-ink">
                  Important <span className="font-normal text-ink-3">— only you can say</span>
                </h3>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-2">
                  It moves something you would still care about in a month — your degree, your
                  health, a promise to someone who matters, a thing you chose. It does not need
                  a deadline to deserve your time.
                </p>
                <p className="mt-1.5 rounded-md bg-surface px-2 py-1.5 text-[11px] leading-snug text-ink-2">
                  <span className="font-medium">The test:</span> if this never got done, what
                  would I have lost? If the honest answer is nothing, leave the star off.
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-md border border-line/60 bg-surface p-2">
              <p className="text-[11px] font-medium text-ink-2">Worked examples</p>
              <table className="mt-1 w-full border-collapse">
                <tbody className="align-top">
                  {([
                    ['Do', 'Assignment due tonight · exam tomorrow · something you promised for today'],
                    ['Schedule', 'A project due in three months · reviewing notes · exercise · planning the next term'],
                    ['Clear it', 'A favour with a date on it · a reply someone needs today · booking a thing before it is gone'],
                    ['Anytime', 'Tidying a folder · a small fix that bothers you · an errand with no deadline'],
                  ] as const).map(([k, v]) => (
                    <tr key={k} className="border-t border-line/50 first:border-t-0">
                      <td className="w-[108px] py-1 pr-2 text-[11px] font-medium text-ink">{k}</td>
                      <td className="py-1 text-[11px] leading-snug text-ink-3">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2.5 text-[11px] leading-snug text-ink-2">
              <span className="font-medium">The trap this exists to catch:</span> loud is not the
              same as important. Eisenhower quoted it as{' '}
              <span className="italic">“the urgent are not important, and the important are never
              urgent.”</span>{' '}Someone else&rsquo;s deadline arriving in your inbox is urgent to
              them; whether it is important to you is a separate question, and answering it is the
              whole exercise.
            </p>

            <p className="mt-2.5 text-[11px] leading-snug text-ink-2">
              <span className="font-medium">Where this differs from the handout:</span> its
              bottom-right box is for distractions to delete — scrolling, meetings nobody needed.
              Nothing like that reaches here, because the filtering happens before anything gets
              typed in. So that box is <span className="font-medium">Anytime</span>: real work with
              no clock and nothing riding on it. The risk is not that you do these, it is that you
              do them <span className="italic">first</span>, because they are the easiest things on
              the list.
            </p>

            <p className="mt-2 text-[11px] leading-snug text-ink-3">
              Columbia&rsquo;s handout suggests keeping each box under about ten. If Do has twenty
              in it, that is not a plan — it is the week telling you Schedule was skipped.
            </p>
          </div>
        )}
      </section>

      {/*
        Pending sits above the grid rather than in it. The matrix sorts work
        by what it deserves from you; this answers who has it, which is a
        different question with a different answer — follow up.
      */}
      <button
        onClick={() => setTab('pending')}
        className={`mb-1.5 flex w-full items-baseline gap-2 rounded-xl border p-2.5 text-left shadow-card ${
          tab === 'pending' ? 'border-mine bg-mine-soft' : 'border-line/50 bg-surface hover:border-line-2'
        }`}
      >
        <span className="h-3 w-[3px] shrink-0 self-center rounded-full"
              style={{ background: `var(${PENDING.tone})` }} />
        <span className="text-[12px] font-semibold">{PENDING.title}</span>
        <span className="text-[10px] text-ink-3">with someone else</span>
        <span className="ml-auto text-[18px] font-semibold leading-none tnum">
          {buckets.pending.length}
        </span>
      </button>

      {/* The matrix itself: four corners, and only four. */}
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {QUADRANTS.map(q => {
          const n = buckets[q.key].length
          const on = tab === q.key
          return (
            <button
              key={q.key}
              onClick={() => setTab(q.key)}
              className={`rounded-xl border p-2.5 text-left shadow-card transition-colors ${
                on ? 'border-mine bg-mine-soft' : 'border-line/50 bg-surface hover:border-line-2'
              }`}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="h-3 w-[3px] shrink-0 rounded-full"
                      style={{ background: `var(${q.tone})` }} />
                <span className="text-[12px] font-semibold">{q.title}</span>
                <span className="ml-auto text-[18px] font-semibold leading-none tnum">{n}</span>
              </div>
              <p className="mt-0.5 text-[9.5px] uppercase tracking-wider text-ink-3">{q.axes}</p>
              <p className="mt-1 text-[10px] leading-snug text-ink-3">{q.blurb}</p>
            </button>
          )
        })}
      </div>

      {note && (
        <p className="mb-3 rounded-lg border border-dropped/30 bg-dropped-soft px-2.5 py-2 text-[12px]
                      leading-snug text-dropped">
          {note}
        </p>
      )}

      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">{meta.title}</h2>
        <span className="text-[10px] tnum text-ink-3">{list.length}</span>
      </div>

      {/* the legend lives below the lists, see the note at the bottom */}
      {list.length === 0 ? (
        <p className="py-2 text-[12px] text-ink-3">
          {tab === 'do'
            ? 'Nothing urgent and important. That is the goal, not a gap.'
            : tab === 'pending'
              ? 'Nothing sitting with anyone else.'
              : tab === 'delegate'
                ? 'Nothing on someone else’s clock.'
                : tab === 'drop'
                  ? 'Nothing waiting for a gap.'
                  : 'Empty.'}
        </p>
      ) : (
        <div className="rounded-xl border border-line/50 bg-surface shadow-card">
          {list.map(r => (
            <div key={r.id} className="flex flex-col border-b border-line/50 px-2 py-1.5 last:border-b-0">
              <div className="flex items-start gap-1.5">
                {/* Importance: the one axis a person has to set. */}
                <button
                  onClick={() => patch(r.id, { important: !r.important })}
                  disabled={busy === r.id}
                  title={r.important ? 'Marked important' : 'Mark important'}
                  className={`mt-[1px] shrink-0 text-[13px] leading-none ${
                    r.important ? 'text-mine' : 'text-ink-3 opacity-50 hover:opacity-100'
                  }`}
                >
                  {r.important ? '★' : '☆'}
                </button>

                <span className="min-w-0 flex-1 break-words text-[12.5px] leading-snug">{r.title}</span>

                {r.due_date && (
                  <span className={`shrink-0 text-[10px] tnum ${
                    r.due_date < now ? 'text-dropped' : 'text-ink-3'
                  }`}>
                    due {mediumLabel(r.due_date)}
                  </span>
                )}
                {r.waiting_on && (
                  <span className="shrink-0 rounded-full bg-mine-soft px-1.5 text-[10px] text-mine">
                    {people.find(p => p.id === r.waiting_on)?.name ?? 'someone'}
                    {r.waiting_since && ` · ${Math.max(0, Math.round(
                      (Date.parse(`${now}T12:00:00Z`) - Date.parse(`${r.waiting_since}T12:00:00Z`)) / 86400000,
                    ))}d`}
                  </span>
                )}
                {where(r) && (
                  <span className="max-w-[30%] shrink truncate text-[10px] text-ink-3">{where(r)}</span>
                )}
              </div>

              {/* One row of verbs, and the quadrant's own verb comes first. */}
              <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
                {tab === 'schedule' || tab === 'do' ? (
                  picking === r.id ? (
                    <>
                      {quickDays.map(d => (
                        <button key={d.date} disabled={busy === r.id}
                                onClick={() => patch(r.id, { planned_date: d.date, planned_auto: false })}
                                className="rounded-full border border-line px-1.5 text-[10px] hover:border-mine hover:text-mine">
                          {d.label}
                        </button>
                      ))}
                      <input type="date" min={now}
                             onChange={e => e.target.value && patch(r.id, { planned_date: e.target.value, planned_auto: false })}
                             className="w-[112px] rounded-sm border border-line bg-surface-2 px-1 text-[10px] tnum" />
                      <button onClick={() => setPicking(null)} className="text-[10px] text-ink-3">cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setPicking(r.id)}
                            className="rounded-full border border-theirs/40 px-2 text-[10px] text-theirs hover:bg-theirs-soft">
                      {r.planned_date ? `planned ${mediumLabel(r.planned_date)}` : 'Pick a day'}
                    </button>
                  )
                ) : null}

                {(tab === 'pending' || tab === 'delegate' || tab === 'drop') && (
                  <select
                    value={r.waiting_on ?? ''}
                    onChange={e => patch(r.id, {
                      waiting_on: e.target.value || null,
                      // Restarting the clock on a re-assign is right: the wait
                      // began when THIS person got it, not the last one.
                      waiting_since: e.target.value ? now : null,
                    })}
                    className="rounded-full border border-line bg-surface-2 px-1.5 text-[10px]"
                  >
                    <option value="">{r.waiting_on ? 'Take it back' : 'Hand it to…'}</option>
                    {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}

                {!r.important && (
                  <button onClick={() => patch(r.id, { important: true })} disabled={busy === r.id}
                          className="rounded-full border border-line px-2 text-[10px] text-ink-2 hover:border-mine hover:text-mine">
                    It matters
                  </button>
                )}

                <button onClick={() => archive(r.id)} disabled={busy === r.id}
                        className="ml-auto rounded-full border border-line px-2 text-[10px] text-ink-3 hover:border-dropped hover:text-dropped">
                  Archive
                </button>
                <a href={`/items/${r.id}`} title="Open" className="shrink-0 p-0.5 text-ink-3 hover:text-mine">
                  <PencilIcon size={11} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        The guide, rendered from the same QUADRANTS the lists are sorted by.
        A legend written out by hand is a legend that quietly stops matching
        the behaviour the first time a rule changes.
      */}
      <section className="mt-5 rounded-xl border border-line/50 bg-surface-2 p-3">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-2">
          What the four mean
        </h2>
        <p className="mb-2 text-[11px] leading-snug text-ink-3">
          <span className="font-medium text-ink-2">Urgent</span> is worked out for you: late, or
          due within {URGENT_WITHIN} days. It is read from the deadline, never from the day you
          planned to do it — scheduling something for tomorrow is a decision you made, not a
          reason it became urgent.{' '}
          <span className="font-medium text-ink-2">Important</span> is the star, and the only
          part you set.
        </p>

        <table className="w-full border-collapse">
          <tbody>
            {QUADRANTS.map(q => (
              <tr key={q.key} className="border-t border-line/60 align-top">
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="h-3 w-[3px] shrink-0 translate-y-[2px] rounded-full"
                          style={{ background: `var(${q.tone})` }} />
                    <span className="text-[12px] font-semibold">{q.title}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-[11px] leading-snug text-ink-2">
                  <span className="text-ink-3">{q.axes}.</span> {q.blurb}
                </td>
                <td className="py-1.5 whitespace-nowrap text-right text-[10.5px] text-mine">
                  {q.verb}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="mt-2 w-full border-collapse border-t border-line/60">
          <tbody>
            <tr className="align-top">
              <td className="py-1.5 pr-2 whitespace-nowrap">
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="h-3 w-[3px] shrink-0 translate-y-[2px] rounded-full"
                        style={{ background: `var(${PENDING.tone})` }} />
                  <span className="text-[12px] font-semibold">{PENDING.title}</span>
                </span>
              </td>
              <td className="py-1.5 pr-2 text-[11px] leading-snug text-ink-2">
                <span className="text-ink-3">Not a quadrant.</span> {PENDING.blurb}
              </td>
              <td className="py-1.5 whitespace-nowrap text-right text-[10.5px] text-mine">
                {PENDING.verb}
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2 border-t border-line/60 pt-2 text-[11px] leading-snug text-ink-3">
          The point of the four is not sorting. It is that <span className="text-ink-2">Schedule</span>{' '}
          is the only quadrant that shrinks the others: everything in{' '}
          <span className="text-ink-2">Do</span> was in Schedule once and was left there too long.
          A week spent mostly in Schedule is a week that went well.
        </p>
      </section>
    </div>
  )
}
