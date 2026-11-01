'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * The track of a segmented control: one highlight (the thumb) that slides
 * between the options instead of the selected pill jumping.
 *
 * The options stay the caller's own elements (buttons, links, radios, tabs),
 * marked `data-segment={key}`, with `data-on` on the selected one. The thumb
 * measures the selected option, so options of any width work, in either
 * direction (offsetLeft is physical, so RTL needs nothing special).
 *
 * Before hydration there is no thumb: the selected option paints its own
 * background (its usual classes), and the CSS drops it once the thumb is
 * placed (`.segmented[data-thumb]` in app/globals.css). The first placement and
 * any re-layout (resize, fonts, counts) snap; only a change of `active` slides.
 *
 * `carryId`: for a control that remounts with the page it switches (the bank
 * flow filter sits in a table keyed on the filter), the new mount picks the
 * thumb up where the old one left it, so the slide carries on.
 */

// Where a remounting track's thumb was when it unmounted, by carryId
const carried = new Map<string, { transform: string; width: string; height: string; at: number }>()

export function SegmentedTrack({
  active,
  thumbClassName,
  carryId,
  className,
  children,
  as: Tag = 'div',
  ...rest
}: {
  /** The `data-segment` key of the selected option; none selected hides the thumb */
  active: string | null | undefined
  /** The selected look, the same as the option's own (background, radius, shadow) */
  thumbClassName: string
  carryId?: string
  as?: 'div' | 'nav'
} & React.HTMLAttributes<HTMLElement>) {
  const trackRef = useRef<HTMLElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  // What the thumb shows now: the key and the box it was given
  const shown = useRef<{ key: string; box: string } | null>(null)
  const [ready, setReady] = useState(false)

  const place = useCallback(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return
    const key = activeRef.current
    const el = [...track.children].find(
      (c): c is HTMLElement => c instanceof HTMLElement && c.dataset.segment === key
    )
    if (!el || key == null) {
      thumb.style.opacity = '0'
      shown.current = null
      return
    }
    const box = `${el.offsetLeft},${el.offsetTop},${el.offsetWidth},${el.offsetHeight}`
    if (shown.current?.key === key && shown.current.box === box) return
    // Slide only from one option to another; the first placement and a re-layout snap
    let slide = !!shown.current && shown.current.key !== key
    const from = !shown.current && carryId ? carried.get(carryId) : undefined
    if (from) {
      carried.delete(carryId!)
      if (performance.now() - from.at < 1000) {
        thumb.style.transition = 'none'
        Object.assign(thumb.style, { transform: from.transform, width: from.width, height: from.height })
        void thumb.offsetWidth
        thumb.style.transition = ''
        slide = true
      }
    }
    if (!slide) thumb.style.transition = 'none'
    thumb.style.opacity = ''
    thumb.style.width = `${el.offsetWidth}px`
    thumb.style.height = `${el.offsetHeight}px`
    thumb.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`
    if (!slide) {
      void thumb.offsetWidth // commit the snap before the transition comes back
      thumb.style.transition = ''
    }
    shown.current = { key, box }
    setReady(true)
  }, [carryId])

  // Leaving mid-slide: note where the thumb is now, for the next mount
  useLayoutEffect(() => {
    const thumb = thumbRef.current
    return () => {
      if (!carryId || !thumb || !shown.current) return
      const cs = getComputedStyle(thumb)
      carried.set(carryId, { transform: cs.transform, width: cs.width, height: cs.height, at: performance.now() })
    }
  }, [carryId])

  // Every render: cheap reads, and options may appear after mount (the theme selector)
  useLayoutEffect(place)

  // Widths change without a render (fonts loading, the window resizing)
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const ro = new ResizeObserver(place)
    ro.observe(track)
    const watchOptions = () => { for (const c of track.children) ro.observe(c) }
    watchOptions()
    const mo = new MutationObserver(watchOptions)
    mo.observe(track, { childList: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [place])

  return (
    <Tag ref={trackRef as React.Ref<HTMLDivElement>} data-thumb={ready || undefined} className={cn('segmented', className)} {...rest}>
      <span ref={thumbRef} aria-hidden className={cn('segmented__thumb', thumbClassName)} />
      {children}
    </Tag>
  )
}
