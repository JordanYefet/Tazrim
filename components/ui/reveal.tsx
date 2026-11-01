'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * A block that opens and closes in place (a filter panel, extra settings):
 * its height eases between 0 and its content (0fr ↔ 1fr rows animate without
 * measuring), the content fades and settles 4px down, on the base beat.
 * Closed, it is inert, so nothing inside takes focus or clicks.
 *
 * The content is clipped only while it moves: open and settled, focus rings
 * and shadows inside can spill out as usual.
 */
export function Reveal({
  open,
  id,
  className,
  children,
}: {
  open: boolean
  /** For the toggle's aria-controls */
  id?: string
  /** On the content (spacing above it belongs here, so it collapses too) */
  className?: string
  children: ReactNode
}) {
  // Settled open: the clip comes off (set when the height transition ends)
  const [settled, setSettled] = useState(open)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setSettled(false)
  }

  return (
    <div
      id={id}
      inert={!open || undefined}
      onTransitionEnd={e => {
        if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows' && open) setSettled(true)
      }}
      className={cn(
        'grid transition-[grid-template-rows] duration-base ease-ui motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      {/* No transition under reduced motion, so no transitionend: open is settled at once */}
      <div className={cn('min-h-0', !(open && settled) && 'overflow-hidden', open && 'motion-reduce:overflow-visible')}>
        <div
          className={cn(
            'transition-[opacity,transform] duration-base ease-ui motion-reduce:transition-none',
            open ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0',
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
