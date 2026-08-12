'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Capture } from './Capture'
import { Sheet } from '@/components/ui/primitives'

/**
 * Navigation.
 *
 * Three primary surfaces — Today, Projects, Notes — because those are the three
 * questions actually asked: what needs me now, how is everything going, and
 * where do I put this. Calendar, People, Sweat and the week view are real but
 * secondary, so they live behind More rather than competing for thumb space.
 *
 * Capture sits in the middle of the bar, the easiest place to reach one-handed,
 * and is present on every screen.
 */

const PRIMARY = [
  { href: '/', label: 'Home', icon: HomeIcon },
  { href: '/today', label: 'Today', icon: SunIcon },
  { href: '/projects', label: 'Projects', icon: StackIcon },
  { href: '/notes', label: 'Notes', icon: NoteIcon },
]

const SECONDARY = [
  { href: '/calendar', label: 'Calendar', hint: 'Day, week and month' },
  { href: '/list', label: 'Everything', hint: 'One flat list, filtered and sorted' },
  { href: '/bulk', label: 'Bulk add', hint: 'Paste a list, one per line' },
  { href: '/people', label: 'People', hint: 'Who you are waiting on' },
]

/** Surfaces that render without the shell. */
const BARE = ['/login', '/portal']

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/'
  const [captureOpen, setCaptureOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const bare = BARE.some(p => pathname === p || pathname.startsWith(p + '/'))

  // Keyboard capture on desktop, where a hardware keyboard exists.
  useEffect(() => {
    if (bare) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (typing) return
      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setCaptureOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [bare])

  if (bare) return <>{children}</>

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <div className="md:flex md:min-h-screen">
      {/* Desktop sidebar. Secondary destinations are visible here because
          there is room; on a phone they would dilute the three that matter. */}
      <aside className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-line md:p-4">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold">merc</div>
        </div>

        <button
          onClick={() => setCaptureOpen(true)}
          className="mb-4 flex items-center gap-2 rounded-md bg-mine px-3 py-2 text-sm font-medium text-bg"
        >
          <PlusIcon /> Capture
          <kbd className="ml-auto rounded border border-bg/20 px-1 text-[10px] opacity-70">c</kbd>
        </button>

        {[...PRIMARY, ...SECONDARY].map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm transition-colors ${
              isActive(link.href) ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {link.label}
          </Link>
        ))}

        <form action="/api/login" method="post" className="mt-auto">
          <button
            type="button"
            onClick={async () => {
              await fetch('/api/login', { method: 'DELETE' })
              window.location.href = '/login'
            }}
            className="w-full rounded-md px-3 py-2 text-left text-xs text-ink-3 hover:text-ink-2"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>

      {/* Mobile bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {PRIMARY.map(link => (
          <NavTab key={link.href} {...link} active={isActive(link.href)} />
        ))}

        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] ${
            SECONDARY.some(s => isActive(s.href)) ? 'text-mine' : 'text-ink-3'
          }`}
        >
          <MoreIcon />
          More
        </button>
      </nav>

      {/* Capture floats above the bar so all four primary tabs keep their slot
          and the button still lands under the thumb. */}
      <button
        onClick={() => setCaptureOpen(true)}
        aria-label="Capture"
        className="fixed right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-mine text-bg shadow-lg md:hidden"
        style={{ bottom: 'calc(66px + env(safe-area-inset-bottom, 0px))' }}
      >
        <PlusIcon />
      </button>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Go to">
        <div className="space-y-1">
          {SECONDARY.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMoreOpen(false)}
              className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-surface-2"
            >
              <span>
                <span className="block text-sm">{link.label}</span>
                <span className="block text-xs text-ink-3">{link.hint}</span>
              </span>
              <span className="text-ink-3">›</span>
            </Link>
          ))}
          <button
            onClick={async () => {
              await fetch('/api/login', { method: 'DELETE' })
              window.location.href = '/login'
            }}
            className="mt-2 w-full rounded-md px-3 py-3 text-left text-sm text-ink-3"
          >
            Sign out
          </button>
        </div>
      </Sheet>

      <Capture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSaved={() => window.dispatchEvent(new CustomEvent('merc:captured'))}
      />
    </div>
  )
}

function NavTab({
  href, label, icon: Icon, active,
}: {
  href: string; label: string; icon: () => ReactNode; active: boolean
}) {
  return (
    <Link
      href={href}
      className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] ${
        active ? 'text-mine' : 'text-ink-3'
      }`}
    >
      <Icon />
      {label}
    </Link>
  )
}

/* Icons are inline so the app pulls in no icon dependency. */

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
    </svg>
  )
}

function StackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="12" width="18" height="5" rx="1.5" /><path d="M6 20h12" strokeLinecap="round" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
