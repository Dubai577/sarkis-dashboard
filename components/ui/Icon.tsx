/**
 * The icon set.
 *
 * Every one of these was a text glyph — ✎ ▲ ▼ × ↗ — typed straight into the
 * markup. Glyphs are the loudest thing dating an interface: they inherit the
 * text baseline so they never sit level with what they label, their weight and
 * size vary by font and platform, and half of them render as emoji on a phone.
 *
 * Drawn on a 24-unit grid, stroked with currentColor so tone comes from the
 * surrounding text colour, and sized by a single prop.
 */

interface Props {
  size?: number
  className?: string
}

function svg(path: React.ReactNode, { size = 14, className = '' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}

export const PencilIcon = (p: Props) =>
  svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>, p)

export const ChevronUpIcon = (p: Props) => svg(<path d="m18 15-6-6-6 6" />, p)
export const ChevronDownIcon = (p: Props) => svg(<path d="m6 9 6 6 6-6" />, p)
export const ChevronRightIcon = (p: Props) => svg(<path d="m9 18 6-6-6-6" />, p)
export const CloseIcon = (p: Props) => svg(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p)
export const PlusIcon = (p: Props) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p)

export const ExternalIcon = (p: Props) =>
  svg(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v7H3V3h7" /></>, p)

export const CalendarIcon = (p: Props) =>
  svg(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>,
    p,
  )
