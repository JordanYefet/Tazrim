'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * The daily update check, on or off (ENG-98): the last row of the version card on
 * Settings → Updates, and a step of the first run (ENG-125), so the two never drift
 * apart. Saves when flipped; a refused save flips it back.
 */
export function AutoCheckSwitch({ initial, className }: { initial: boolean; className?: string }) {
  const [on, setOn] = useState(initial)

  async function set(next: boolean) {
    setOn(next)
    try {
      const res = await fetch('/api/updates/auto', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ on: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setOn(!next)
    }
  }

  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-3', className)}>
      <span id="auto-check-label" className="text-sm text-muted-foreground">
        בדיקה אוטומטית פעם ביום
      </span>
      {/* The button is the 44 px hit area; the visual switch inside keeps its size, so the row doesn't move */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="auto-check-label"
        onClick={() => set(!on)}
        className="group -my-2.5 -me-0.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none"
      >
        <span
          aria-hidden
          className={cn(
            'relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-fast ease-ui group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
            // The off track keeps a hairline edge: a control's boundary needs 3:1 (WCAG 1.4.11)
            on ? 'bg-primary' : 'bg-muted-foreground/30 ring-1 ring-inset ring-muted-foreground/70'
          )}
        >
          <span
            className={cn(
              'absolute start-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-ui motion-reduce:transition-none',
              // RTL: "on" moves the knob toward the end (left)
              on && '-translate-x-4'
            )}
          />
        </span>
      </button>
    </div>
  )
}
