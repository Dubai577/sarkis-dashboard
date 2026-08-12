'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

/**
 * A collapsible hub panel that remembers what you left open.
 *
 * State lives in localStorage rather than the URL: it is a per-device reading
 * preference, not something worth linking or sharing, and the hub already has
 * enough query params from the filter bar.
 *
 * Two rules the hub depends on:
 *
 *   1. An EMPTY section collapses to one quiet line. A large card announcing
 *      that there is nothing there costs a whole screen on a phone and tells
 *      you less than a single grey row.
 *   2. The header is always tappable and always shows the count, so a collapsed
 *      panel still carries its information. Collapsing hides detail, never the
 *      fact that something is there.
 */

const STORE_KEY = 'merc.panels.v1'

function readOpenState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeOpenState(next: Record<string, boolean>) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* private mode, quota — not worth surfacing */
  }
}

export function usePanelState(id: string, fallback: boolean) {
  // Always start from `fallback` so the server and first client render agree;
  // the stored preference is applied immediately after mount.
  const [open, setOpen] = useState(fallback)

  useEffect(() => {
    const stored = readOpenState()[id]
    if (typeof stored === 'boolean') setOpen(stored)
  }, [id])

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev
      writeOpenState({ ...readOpenState(), [id]: next })
      return next
    })
  }, [id])

  return [open, toggle] as const
}

export function Panel({
  id,
  title,
  count,
  tone,
  hint,
  action,
  defaultOpen = true,
  emptyLabel = 'Nothing here',
  children,
}: {
  /** Stable key for the remembered open/closed state. */
  id: string
  title: string
  /** Shown in the header and used to decide the empty treatment. */
  count?: number
  tone?: 'dropped' | 'mine'
  hint?: string
  /** Rendered on the right of the header, e.g. a link to the full view. */
  action?: ReactNode
  defaultOpen?: boolean
  emptyLabel?: string
  children: ReactNode
}) {
  const [open, toggle] = usePanelState(id, defaultOpen)
  const isEmpty = count === 0

  // Rule 1: empty is one quiet line, never an expandable card.
  if (isEmpty) {
    return (
      <div className="flex items-baseline gap-2 border-b border-line/60 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">{title}</span>
        <span className="text-[11px] text-ink-3/70">{emptyLabel}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
    )
  }

  const toneClass =
    tone === 'dropped' ? 'text-dropped' : tone === 'mine' ? 'text-mine' : 'text-ink-2'

  return (
    <section className="border-b border-line/60 py-1.5 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex flex-1 items-baseline gap-2 text-left"
        >
          <span className={`text-[11px] font-medium uppercase tracking-wider ${toneClass}`}>
            {title}
          </span>
          {count !== undefined && (
            <span className="text-[11px] tnum text-ink-3">{count}</span>
          )}
          {hint && <span className="text-[10px] text-ink-3">{hint}</span>}
          <span className="ml-auto text-[10px] text-ink-3">{open ? '▾' : '▸'}</span>
        </button>
        {action && <span className="shrink-0">{action}</span>}
      </div>
      {open && <div className="mt-1">{children}</div>}
    </section>
  )
}
