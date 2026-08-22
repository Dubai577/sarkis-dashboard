'use client'

import { useEffect, useState } from 'react'

/**
 * Light / dark / follow-the-system.
 *
 * Three states rather than two: "system" is the honest default, because the
 * phone already switches at dusk and most people want that. An explicit choice
 * overrides it in both directions.
 *
 * The choice is written to <html data-theme> and to localStorage. A tiny script
 * in the document head applies the stored value before first paint — without it
 * the page renders in the default theme and then flips, which is worse than
 * having no toggle.
 */

export type Theme = 'light' | 'dark' | 'system'

export const THEME_KEY = 'merc.theme'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)

  // Keep the browser chrome in step with the page.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    meta.setAttribute('content', dark ? '#121110' : '#FAF8F6')
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const stored = (localStorage.getItem(THEME_KEY) as Theme) || 'system'
    setTheme(stored)
  }, [])

  function choose(next: Theme) {
    setTheme(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      /* private mode — the choice just will not persist */
    }
    applyTheme(next)
  }

  const options: { value: Theme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]

  return (
    <div>
      <span className="mb-1.5 block text-[10px] uppercase tracking-wider text-ink-3">Appearance</span>
      <div className="flex gap-1">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            aria-pressed={theme === o.value}
            className={`flex-1 rounded-md border py-1.5 text-[11px] ${
              theme === o.value
                ? 'border-mine bg-mine-soft text-mine'
                : 'border-line text-ink-2'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
