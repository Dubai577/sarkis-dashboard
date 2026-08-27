'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/* ============================================================
   The component vocabulary. Every surface composes from these,
   so a design pass restyles here rather than editing screens.
   ============================================================ */

// ── checkbox ─────────────────────────────────────────────────────

/**
 * Larger hit area than its visual size — 44px of tappable space around a 16px
 * box, because this is the single most-tapped control in the app and it is
 * used one-handed while walking.
 */
export function Check({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange() }}
      className="shrink-0 grid place-items-center -m-2 p-2 disabled:opacity-40"
    >
      <span
        className={`grid place-items-center w-[17px] h-[17px] rounded-[5px] border transition-colors ${
          checked
            ? 'bg-done border-done'
            : 'border-ink-3 hover:border-ink-2'
        }`}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="var(--bg)"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    </button>
  )
}

// ── chips and labels ─────────────────────────────────────────────

export function Chip({
  children,
  color,
  className = '',
}: {
  children: ReactNode
  color?: string | null
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border border-line px-1.5 py-px text-[10px] leading-4 text-ink-2 ${className}`}
      style={color ? { borderColor: `${color}55`, color } : undefined}
    >
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  )
}

/** A category's colour as a vertical rail on the left of a row. */
export function CategoryRail({ color }: { color?: string | null }) {
  return (
    <span
      className="w-[3px] self-stretch rounded-full shrink-0"
      style={{ background: color ?? 'var(--border-2)' }}
      aria-hidden="true"
    />
  )
}

// ── buttons ──────────────────────────────────────────────────────

export function Button({
  children,
  onClick,
  variant = 'quiet',
  type = 'button',
  disabled,
  className = '',
  full,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'quiet' | 'danger' | 'ghost'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  full?: boolean
}) {
  const styles = {
    primary: 'bg-mine text-bg font-medium shadow-card hover:opacity-90 active:scale-[0.98]',
    quiet:   'bg-surface-2 text-ink border border-line hover:bg-surface-3 active:scale-[0.98]',
    danger:  'bg-dropped-soft text-dropped border border-dropped/30 hover:bg-dropped/15 active:scale-[0.98]',
    ghost:   'text-ink-2 hover:text-ink',
  }[variant]

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 min-h-[38px] text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${styles} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

// ── feedback ─────────────────────────────────────────────────────

/**
 * Failures are always visible. Every write in this app is optimistic, so a
 * silent failure would look exactly like data loss.
 */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-dropped/40 bg-dropped-soft px-3 py-2.5 text-sm text-dropped fade-in"
    >
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-ink-2 text-sm">{title}</p>
      {hint && <p className="text-ink-3 text-xs max-w-[32ch] leading-relaxed">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center text-ink-3 text-sm">
      <span className="w-3 h-3 rounded-full border-2 border-ink-3 border-t-transparent animate-spin" />
      {label}
    </div>
  )
}

// ── bottom sheet ─────────────────────────────────────────────────

/**
 * Every editing surface in the app is this sheet. It slides from the bottom so
 * controls land under the thumb rather than at the top of the screen.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={ref}
        onClick={e => e.stopPropagation()}
        className="sheet-in w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2 sm:hidden" />
        {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
        {children}
        {footer && <div className="mt-4 flex gap-2">{footer}</div>}
      </div>
    </div>
  )
}

// ── inputs ───────────────────────────────────────────────────────

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-base text-ink outline-none ' +
  'placeholder:text-ink-3 hover:border-line-2 focus:border-mine focus:ring-2 focus:ring-mine/15'
