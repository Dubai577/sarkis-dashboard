import type { Possession } from '@/lib/possession'

/**
 * The possession glyph. One shape, three states, learned once and identical on
 * every surface — Today, Projects, item detail, People, calendar, email.
 *
 *   filled disc   mine    — it has weight
 *   hollow ring   theirs  — no weight on me
 *   broken ring   dropped — the ring is literally broken; it is mine again
 *
 * Colour alone never carries the meaning: the three are distinguishable by
 * shape at 12px on a phone, which colour is not.
 */
export function PossessionGlyph({
  state,
  size = 14,
  className = '',
  title,
}: {
  state: Possession
  size?: number
  className?: string
  title?: string
}) {
  const r = 5.2
  const stroke = 1.9

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {state === 'mine' && <circle cx="8" cy="8" r={r} fill="var(--mine)" />}

      {state === 'theirs' && (
        <circle cx="8" cy="8" r={r} fill="none" stroke="var(--theirs)" strokeWidth={stroke} />
      )}

      {state === 'dropped' && (
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke="var(--dropped)"
          strokeWidth={stroke}
          strokeDasharray="21 12"
          transform="rotate(-58 8 8)"
        />
      )}
    </svg>
  )
}

/** Small legend, shown once on the Projects board rather than on every row. */
export function PossessionLegend({ className = '' }: { className?: string }) {
  const entries: [Possession, string][] = [
    ['mine', 'On me'],
    ['theirs', 'Waiting'],
    ['dropped', 'Needs a nudge'],
  ]
  return (
    <div className={`flex items-center gap-4 text-[11px] text-ink-3 ${className}`}>
      {entries.map(([state, label]) => (
        <span key={state} className="flex items-center gap-1.5">
          <PossessionGlyph state={state} size={11} />
          {label}
        </span>
      ))}
    </div>
  )
}
