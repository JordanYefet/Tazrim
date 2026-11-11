'use client'

import { useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * "Back to this month", beside the period picker while another period is shown.
 * It grows in (its column eases 0fr ↔ 1fr, so the picker slides over instead
 * of jumping) and shrinks away, staying mounted: hidden, it is inert and
 * aria-hidden. Phones get the icon only; the header is tight there.
 */
export function TodayButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  // Settled open: the clip comes off, so the focus ring is not cut (same as <Reveal>)
  const [settled, setSettled] = useState(show)
  const [wasShown, setWasShown] = useState(show)
  if (show !== wasShown) {
    setWasShown(show)
    setSettled(false)
  }

  function reset(e: React.MouseEvent<HTMLButtonElement>) {
    // The button goes inert under the focus: hand it to the picker's month button
    const trigger = e.currentTarget
      .closest('[data-period-controls]')
      ?.querySelector<HTMLElement>('[aria-haspopup="dialog"]')
    onClick()
    trigger?.focus()
  }

  return (
    <div
      inert={!show || undefined}
      aria-hidden={!show || undefined}
      onTransitionEnd={e => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-columns' && show) setSettled(true)
      }}
      className={cn(
        'grid transition-[grid-template-columns] ease-ui motion-reduce:transition-none',
        // Arrives on the base beat, leaves on the fast one, like the app's panels
        show ? 'grid-cols-[1fr] duration-base' : 'grid-cols-[0fr] duration-fast'
      )}
    >
      {/* No transition under reduced motion, so no transitionend: shown is settled at once */}
      <div className={cn('min-w-0', !(show && settled) && 'overflow-hidden', show && 'motion-reduce:overflow-visible')}>
        <div
          className={cn(
            'ps-1.5 transition-[opacity,transform] ease-ui motion-reduce:transition-none',
            show ? 'scale-100 opacity-100 duration-base' : 'scale-90 opacity-0 duration-fast'
          )}
        >
          <button
            type="button"
            onClick={reset}
            aria-label="חזרה לחודש הנוכחי"
            title="חזרה לחודש הנוכחי"
            className={cn(
              'relative flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-muted/70 text-sm font-semibold text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'sm:w-auto sm:px-3',
              // the 44px hit area around the 36px button
              'before:absolute before:-inset-1 before:content-[""]'
            )}
          >
            <CalendarCheck className="h-4 w-4" aria-hidden />
            <span className="max-sm:hidden">החודש</span>
          </button>
        </div>
      </div>
    </div>
  )
}
