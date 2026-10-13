'use client'

import { useEffect, useRef, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils/cn'
import { THEME_OPTIONS, normalizeTheme, stepTheme, type ThemeValue } from '@/lib/utils/theme'

const ICONS: Record<ThemeValue, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

/**
 * Three-way segmented control (radiogroup): בהיר / כהה / מערכת.
 * The outer box always renders at a fixed size so there is no layout shift;
 * the segments render only after mount to avoid a hydration mismatch.
 */
export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const current = normalizeTheme(theme)

  function onKeyDown(e: React.KeyboardEvent) {
    // RTL: ArrowLeft moves to the next item visually, ArrowRight to the previous.
    let dir: 1 | -1 | 0 = 0
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dir = 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dir = -1
    if (!dir) return
    e.preventDefault()
    const next = stepTheme(current, dir)
    setTheme(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="ערכת נושא"
      onKeyDown={onKeyDown}
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted border border-border h-8 w-[5.75rem] shrink-0"
    >
      {mounted && THEME_OPTIONS.map(({ value, label }) => {
        const Icon = ICONS[value]
        const selected = current === value
        return (
          <button
            key={value}
            ref={el => { refs.current[value] = el }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTheme(value)}
            className={cn(
              'flex-1 h-full rounded-md flex items-center justify-center transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
