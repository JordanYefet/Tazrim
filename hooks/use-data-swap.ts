'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { EASE, MOTION } from '@/lib/motion'

/*
 * Data swapping in place (a filter, another month, the next page): the rows
 * ease in instead of jumping. The page's arrival is .page-in's job, so the
 * first mount plays nothing; only a change of `key` after it does.
 *
 * Nothing remounts: the element stays and only gets a WAAPI animation, so
 * selection, open rows and focus survive. A change mid-animation cancels the
 * running one and starts again from what is on screen.
 *
 * `targets`: a selector for the parts that fade (say, the table but not its
 * toolbar); without it the element itself fades. `height`: the element's
 * height also eases from the old to the new, so the page below slides rather
 * than jumps when the row count changes; for that the element itself must stay
 * mounted (its ResizeObserver is set up once).
 */

/** A primitive, so a parent re-render (router.refresh after a save) with the same filters plays nothing */
export type DataSwapKey = string | number | null | undefined

export interface DataSwapOptions {
  /** Ease the element's height from the old to the new size */
  height?: boolean
  /** Selector for the descendants that fade in; the element itself when absent or nothing matches */
  targets?: string
}

/** The fade every swap plays: a short rise, quicker than the page's 6px arrival */
export const SWAP_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'translateY(4px)' },
  { opacity: 1, transform: 'none' },
]

/** Gives the element back the overflow it had before a height animation clipped it */
function unclip(el: HTMLElement, clipped: { current: string | null }) {
  if (clipped.current === null) return
  el.style.overflow = clipped.current
  clipped.current = null
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useDataSwap(ref: RefObject<HTMLElement | null>, key: DataSwapKey, { height = false, targets }: DataSwapOptions = {}) {
  const lastKey = useRef(key)
  // The height on screen, kept by a ResizeObserver: when the key changes the
  // DOM already holds the new rows, so the old height has to be known beforehand
  const shownHeight = useRef<number | null>(null)
  const running = useRef<Animation[]>([])
  // The element's own overflow while a height animation clips it
  const clipped = useRef<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!height || !el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      shownHeight.current = entry.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, height])

  // Before paint, so the new rows never show a frame unanimated
  useLayoutEffect(() => {
    if (Object.is(lastKey.current, key)) return
    lastKey.current = key
    const el = ref.current
    if (!el || typeof el.animate !== 'function' || reducedMotion()) return

    // Read before cancelling: mid-animation this is the in-between height on screen
    const from = shownHeight.current
    running.current.forEach(a => a.cancel())
    running.current = []
    unclip(el, clipped)

    const timing: KeyframeAnimationOptions = { duration: MOTION.base, easing: EASE.ui }
    const matched = targets ? Array.from(el.querySelectorAll<HTMLElement>(targets)) : []
    for (const target of matched.length ? matched : [el]) running.current.push(target.animate(SWAP_KEYFRAMES, timing))

    if (height && from !== null) {
      const to = el.getBoundingClientRect().height
      if (Math.abs(to - from) >= 1) {
        // clip, not hidden: it makes no scroll container, so sticky headers inside keep sticking
        clipped.current = el.style.overflow
        el.style.overflow = 'clip'
        const grow = el.animate([{ height: `${from}px` }, { height: `${to}px` }], timing)
        // The finish event comes a task later; a newer swap may own the clip by then
        grow.onfinish = () => { if (running.current.includes(grow)) unclip(el, clipped) }
        running.current.push(grow)
      }
    }
  }, [ref, key, height, targets])

  // Leaving mid-swap: nothing left running on a detached node
  useEffect(() => () => running.current.forEach(a => a.cancel()), [])
}
