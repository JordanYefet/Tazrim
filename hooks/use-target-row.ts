'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { EASE, MOTION } from '@/lib/motion'

/** How long the highlight takes to fade out, after appearing */
const FADE_OUT = 1200
/** Appearing: fast, so it reads as "this one" */
const FADE_IN = 150

/**
 * A link's target row (`?tx=<id>`, e.g. from a card page's "paid from" chip):
 * once, on arrival, the row with that id is scrolled to the middle of the
 * screen and lit briefly (a tint and an accent on its start edge), then the
 * param is dropped from the address in place, so a reload doesn't replay it.
 * Rows are found by `data-row-id`. Nothing happens when the row isn't loaded.
 *
 * Under reduced motion the scroll jumps; the highlight is a fade either way.
 */
export function useTargetRow(container: React.RefObject<HTMLElement | null>, rowIds: readonly string[]) {
  const params = useSearchParams()
  // Read once: dropping it from the address must not cancel the scroll on its way
  const [target] = useState(() => params.get('tx'))

  useEffect(() => {
    if (!target) return

    // Dropped right away, found or not: the param only means "on arrival"
    const url = new URL(window.location.href)
    url.searchParams.delete('tx')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)

    if (!rowIds.includes(target)) return
    // A table and its phone rows both carry the id; the one on screen is the target
    const row = [...(container.current?.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(target)}"]`) ?? [])]
      .find(el => el.getClientRects().length > 0)
    if (!row) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let timer = 0
    let anim: Animation[] = []

    // After the page's own entrance (the wallet and the content land on the page beat),
    // so the row is where it will stay when it is scrolled to
    const start = window.setTimeout(() => {
      row.scrollIntoView({ block: 'center', behavior: reduce ? 'instant' : 'smooth' })
      let lit = false
      const light = () => {
        if (lit) return
        lit = true
        window.clearTimeout(timer)
        window.removeEventListener('scrollend', light)
        anim = highlight(row)
      }
      // Lit once the scroll lands; scrollend doesn't fire when it was already in view
      window.addEventListener('scrollend', light, { once: true })
      timer = window.setTimeout(light, reduce ? 0 : MOTION.page)
    }, reduce ? 0 : MOTION.page)

    return () => {
      window.clearTimeout(start)
      window.clearTimeout(timer)
      for (const a of anim) a.cancel()
    }
    // Arrival only: later row changes (load more, edits) never replay it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** The tint on the row and the accent on its first cell's start edge, in fast and out slow */
function highlight(row: HTMLElement): Animation[] {
  const style = getComputedStyle(row)
  const rtl = style.direction === 'rtl'
  // Resolved here: keyframes get plain colours, not var()
  const primary = style.getPropertyValue('--primary').trim()
  const tint = (a: number) => `hsl(${primary} / ${a})`
  // An inset shadow is drawn from the side opposite its offset: negative x lights the right edge
  const accent = `inset ${rtl ? -3 : 3}px 0 0 ${tint(1)}`
  const none = `inset 0 0 0 ${tint(0)}`
  const total = FADE_IN + FADE_OUT
  const timing: KeyframeAnimationOptions = { duration: total, easing: 'linear' }
  // Offsets put the fast ease-out in and the slow fade out on one timeline
  const at = FADE_IN / total
  const out: Animation[] = [
    row.animate(
      [
        { backgroundColor: tint(0), easing: EASE.ui },
        { backgroundColor: tint(0.14), offset: at, easing: 'ease-in-out' },
        { backgroundColor: tint(0) },
      ],
      timing
    ),
  ]
  const first = row.firstElementChild as HTMLElement | null
  if (first) {
    out.push(
      first.animate(
        [
          { boxShadow: none, easing: EASE.ui },
          { boxShadow: accent, offset: at, easing: 'ease-in-out' },
          { boxShadow: none },
        ],
        timing
      )
    )
  }
  return out
}
