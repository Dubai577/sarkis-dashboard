'use client'

/**
 * Rank by picking a number, the way a spreadsheet lets you type one.
 *
 * Arrows move a row one step at a time, which is fine for a nudge and useless
 * for "this belongs at the top" in a list of thirty — that is twenty-nine
 * taps and twenty-nine writes.
 *
 * It is a select rather than a number field on purpose. A text input under
 * 16px makes iOS magnify the page on focus, and raising it to 16px makes the
 * control too wide to sit in a row; a select opens a picker instead of a
 * keyboard, so it stays small on a phone and costs one tap there.
 *
 * The number shown is the row's position in the list in front of you, so the
 * list always reads 1..n with no gaps, whatever is stored underneath.
 */
export function Rank({
  position,
  total,
  disabled,
  label,
  onSet,
}: {
  /** 1-based position in the visible list. */
  position: number
  total: number
  disabled?: boolean
  label: string
  /** The 1-based position to move this row to. */
  onSet: (position: number) => void
}) {
  return (
    <select
      value={position}
      disabled={disabled || total < 2}
      aria-label={label}
      title={`${position} of ${total} — pick a number to move it`}
      onChange={e => {
        const next = Number(e.target.value)
        if (Number.isFinite(next) && next !== position) onSet(next)
      }}
      className="w-[34px] shrink-0 rounded-sm border border-line bg-surface-2 px-0.5 py-px
                 text-center text-[10px] tnum text-ink-3 outline-none
                 focus:border-mine focus:text-ink disabled:opacity-40"
    >
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  )
}
