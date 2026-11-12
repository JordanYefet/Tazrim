'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { animateSpring, project, rubberBand, spring, velocityOf } from '@/lib/spring'

/** Movement past this many pixels decides between a drag and a tap or a scroll. */
const SLOP = 6
/** Past this share of the sheet's height, letting go closes it. */
const CLOSE_AT = 0.4
/** Velocity is measured over the last this-many milliseconds. */
const VELOCITY_WINDOW = 100
/** Back into place: a little bounce. Away: quick, no bounce. */
const BACK = spring(0.38, 0.82)
const AWAY = spring(0.3, 1)

/**
 * Drag a bottom sheet down to close it (AppDialog on phones, the "עוד" sheet).
 *
 * The sheet follows the finger 1:1 from the first movement, the scrim fades
 * with it, and upward it rubber-bands. Let go past ~40% of its height, or
 * with a downward flick, and it carries on out and closes; otherwise it
 * springs back. A touch that starts while the sheet's content is scrolled
 * scrolls it instead, and so does a sideways one. The close button and a tap
 * on the scrim still close it.
 *
 * Touch events, not pointer events: once the browser starts a scroll it
 * cancels the pointer, and only a non-passive touchmove can stop that scroll
 * when the drag is the sheet's.
 *
 * Hand the sheet over with the returned callback ref: Radix mounts the
 * content a render after the dialog opens (inside its Portal), so the
 * listeners attach when the element appears, not when the caller renders.
 *
 * On close the sheet is already off screen, so it gets `data-dragged-away`:
 * the CSS skips its exit animation (which would start from its resting place).
 */
export function useDragToDismiss({
  scrimRef,
  onDismiss,
  enabled = () => true,
}: {
  scrimRef?: React.RefObject<HTMLElement | null>
  onDismiss: () => void
  /** Checked at touch-down (e.g. only while the window is a phone sheet) */
  enabled?: () => boolean
}) {
  const dismiss = useRef(onDismiss)
  const isEnabled = useRef(enabled)
  dismiss.current = onDismiss
  isEnabled.current = enabled
  const gesture = useRef({
    startX: 0,
    startY: 0,
    state: 'idle' as 'idle' | 'deciding' | 'dragging' | 'ignored',
    offset: 0,
    samples: [] as [number, number][],
    stop: () => {},
  })

  const [sheet, setSheet] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!sheet) return

    // Kept across renders (the listeners are re-bound on each, the gesture lives on)
    const g = gesture.current

    const scrollerAt = (target: EventTarget | null): HTMLElement | null => {
      // The nearest scrolled box between the touch and the sheet (the sheet itself included)
      for (let el = target as HTMLElement | null; el; el = el.parentElement) {
        if (el.scrollTop > 0) return el
        if (el === sheet) break
      }
      return null
    }

    const paint = (y: number) => {
      g.offset = y
      sheet.style.transform = y ? `translateY(${y}px)` : ''
      const scrim = scrimRef?.current
      if (scrim) scrim.style.opacity = y > 0 ? String(Math.max(0, 1 - y / sheet.offsetHeight)) : ''
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !isEnabled.current()) {
        g.state = 'ignored'
        return
      }
      const t = e.touches[0]
      const el = e.target as HTMLElement
      // Range inputs and anything that opts out keep their own drag; a scrolled list scrolls
      if (el.closest('input[type="range"], [data-no-sheet-drag]') || scrollerAt(e.target)) {
        g.state = 'ignored'
        return
      }
      g.stop()
      g.startX = t.clientX
      g.startY = t.clientY - g.offset
      g.samples = [[t.clientY, e.timeStamp]]
      g.state = g.offset ? 'dragging' : 'deciding'
    }

    const onMove = (e: TouchEvent) => {
      if (g.state === 'idle' || g.state === 'ignored') return
      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY
      if (g.state === 'deciding') {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        // Sideways, or up into content that can scroll: not ours
        if (Math.abs(dx) > Math.abs(dy) || (dy < 0 && sheet.scrollHeight > sheet.clientHeight)) {
          g.state = 'ignored'
          return
        }
        g.state = 'dragging'
        sheet.setAttribute('data-dragging', '')
      }
      e.preventDefault()
      g.samples.push([t.clientY, e.timeStamp])
      g.samples = g.samples.filter(([, ts]) => e.timeStamp - ts <= VELOCITY_WINDOW)
      paint(dy >= 0 ? dy : -rubberBand(-dy, sheet.offsetHeight * 0.25))
    }

    const onEnd = (e: TouchEvent) => {
      if (g.state !== 'dragging') {
        g.state = 'idle'
        return
      }
      g.state = 'idle'
      sheet.removeAttribute('data-dragging')
      const recent = g.samples.filter(([, ts]) => e.timeStamp - ts <= VELOCITY_WINDOW)
      const v = velocityOf(recent)
      const h = sheet.offsetHeight
      if (g.offset > 0 && project(g.offset, v) > h * CLOSE_AT) {
        g.stop = animateSpring(g.offset, h + 24, Math.max(v, 0), AWAY, paint, () => {
          sheet.setAttribute('data-dragged-away', '')
          dismiss.current()
        })
      } else {
        g.stop = animateSpring(g.offset, 0, v, BACK, paint)
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      g.stop()
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [sheet, scrimRef])

  /** Pass as (or call from) the sheet's ref */
  return useCallback((el: HTMLElement | null) => setSheet(el), [])
}
