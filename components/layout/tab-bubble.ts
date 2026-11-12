'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import {
  atRest,
  follow,
  FOLLOW,
  LIFT_RATE,
  LIFT_SCALE,
  nearestSlot,
  releaseSlot,
  SETTLE,
  slotLayout,
  step,
  velocityOf,
} from '@/lib/nav/bubble-physics'
import { prefersReducedMotion } from '@/lib/spring'

/** Movement past this many pixels makes a press a drag (below it, a tap). */
const SLOP = 6
/** Velocity is measured over the last this-many milliseconds of the drag. */
const VELOCITY_WINDOW = 100
/** A click this soon after a handled release is the same gesture: swallow it. */
const CLICK_GUARD = 600

/**
 * The phone tab bar's capsule as something you hold (lib/nav/bubble-physics.ts).
 *
 * Touch down and the capsule lifts and jumps under the finger; drag and it
 * follows 1:1, rubber-banding past the ends; let go and it settles on the
 * nearest slot (a flick carries it one further), and only then does
 * `onCommit` change the route. It stays interruptible: a new touch takes it
 * from wherever it is. Keyboard activation is left to the links.
 *
 * The slots are the nav's `[data-slot]` children, in DOM order. Until this
 * runs, the capsule sits where CSS puts it (`--slot`), so the server render is
 * already right.
 */
export function useTabBubble({
  navRef,
  capRef,
  activeSlot,
  routeKey,
  onCommit,
}: {
  navRef: React.RefObject<HTMLElement | null>
  capRef: React.RefObject<HTMLElement | null>
  /** The slot the page (or the open sheet) says is selected; -1 for none */
  activeSlot: number
  /** Changes when the route does (the pathname), to let go of a pending slot */
  routeKey: string
  /** A release on `slot`; returns the slot the capsule should rest on until the route catches up */
  onCommit: (slot: number, gesture: { dragged: boolean }) => number
}) {
  const s = useRef({
    positions: [] as number[],
    origin: 0,
    slotWidth: 0,
    x: 0,
    v: 0,
    lift: 0,
    target: 0,
    held: false,
    dragged: false,
    startX: 0,
    finger: 0,
    samples: [] as [number, number][],
    raf: 0,
    last: 0,
    pending: null as number | null,
    handledAt: -Infinity,
    placed: false,
  }).current

  // The latest selection, for the resize handler below (its closure would keep the first render's)
  const activeRef = useRef(activeSlot)
  activeRef.current = activeSlot

  const slots = useCallback(
    () => Array.from(navRef.current?.querySelectorAll<HTMLElement>('[data-slot]') ?? []),
    [navRef]
  )

  const measure = useCallback(() => {
    const els = slots()
    if (!els.length) return
    const layout = slotLayout(els.map(el => el.getBoundingClientRect()))
    s.origin = layout.origin
    s.slotWidth = layout.slotWidth
    s.positions = layout.positions
  }, [s, slots])

  const draw = useCallback(() => {
    const cap = capRef.current
    if (!cap) return
    const stretch = Math.min(Math.abs(s.v) / 4500, 0.1)
    const grow = 1 + s.lift * LIFT_SCALE
    cap.style.transform = `translateX(${s.x}px) scale(${grow + stretch}, ${grow - stretch * 0.5})`
    // While steering, the icon under the capsule is the lit one
    const nav = navRef.current
    if (nav?.hasAttribute('data-steering')) {
      const hot = nearestSlot(s.x, s.positions)
      slots().forEach((el, i) => el.toggleAttribute('data-hot', i === hot))
    }
  }, [s, capRef, navRef, slots])

  const tick = useCallback(
    (t: number) => {
      const dt = (t - s.last) / 1000
      s.last = t
      const next = step({ x: s.x, v: s.v }, s.target, s.held ? FOLLOW : SETTLE, dt)
      s.x = next.x
      s.v = next.v
      s.lift += ((s.held ? 1 : 0) - s.lift) * Math.min(1, dt * LIFT_RATE)
      if (!s.held && atRest(s, s.target) && s.lift < 0.01) {
        s.x = s.target
        s.v = 0
        s.lift = 0
        s.raf = 0
        draw()
        return
      }
      draw()
      s.raf = requestAnimationFrame(tick)
    },
    [s, draw]
  )

  const run = useCallback(() => {
    if (prefersReducedMotion()) {
      // Direct manipulation still tracks the finger; nothing springs or grows
      cancelAnimationFrame(s.raf)
      s.raf = 0
      s.x = s.target
      s.v = 0
      s.lift = 0
      draw()
      return
    }
    if (!s.raf) {
      s.last = performance.now()
      s.raf = requestAnimationFrame(tick)
    }
  }, [s, draw, tick])

  const endSteering = useCallback(() => {
    navRef.current?.removeAttribute('data-steering')
    slots().forEach(el => el.removeAttribute('data-hot'))
  }, [navRef, slots])

  // Take the capsule over from CSS once there is layout to measure
  useLayoutEffect(() => {
    const place = () => {
      measure()
      const cap = capRef.current
      if (!cap || !s.positions.length) return
      // From here on the transform is ours; opacity keeps its CSS fade
      cap.style.transition = 'opacity var(--motion-fast) var(--ease-ui)'
      if (!s.held && !s.raf) {
        const slot = s.pending ?? activeRef.current
        if (slot >= 0) s.x = s.target = s.positions[slot]
        draw()
      }
      s.placed = true
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
    // Not re-run per selection (the effect below glides to it); a resize reads the latest from activeRef
  }, [measure, draw, capRef, s])

  // The route (or the sheet) moved the selection: glide there, unless a release is still on its way
  useEffect(() => {
    if (!s.placed || s.held) return
    if (s.pending !== null && activeSlot !== s.pending) return
    s.pending = null
    endSteering()
    if (activeSlot < 0) return
    measure()
    s.target = s.positions[activeSlot]
    run()
  }, [activeSlot, s, measure, run, endSteering])

  // A new route always ends a pending release (the guard above must never stick)
  useEffect(() => {
    if (s.pending === null || s.held) return
    s.pending = null
    endSteering()
  }, [routeKey, s, endSteering])

  useEffect(() => () => cancelAnimationFrame(s.raf), [s])

  const fingerTarget = (clientX: number) => follow(clientX - s.origin, s.positions, s.slotWidth)

  // React bubbles events through portals: a touch in the "עוד" sheet (rendered inside the nav's
  // tree) reaches these handlers too. Only touches on the bar itself are the capsule's.
  const onBar = (e: React.SyntheticEvent) => !!navRef.current?.contains(e.target as Node)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary || !onBar(e)) return
    measure()
    if (!s.positions.length) return
    try {
      navRef.current?.setPointerCapture(e.pointerId)
    } catch {}
    s.held = true
    s.dragged = false
    s.startX = e.clientX
    s.finger = e.clientX - s.origin
    s.samples = [[e.clientX, e.timeStamp]]
    navRef.current?.setAttribute('data-steering', '')
    s.target = fingerTarget(e.clientX)
    run()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!s.held) return
    if (Math.abs(e.clientX - s.startX) > SLOP) s.dragged = true
    s.finger = e.clientX - s.origin
    s.samples.push([e.clientX, e.timeStamp])
    s.samples = s.samples.filter(([, t]) => e.timeStamp - t <= VELOCITY_WINDOW)
    s.target = fingerTarget(e.clientX)
    run()
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!s.held) return
    s.held = false
    s.handledAt = performance.now()
    const recent = s.samples.filter(([, t]) => e.timeStamp - t <= VELOCITY_WINDOW)
    // A tap lands on the slot under the finger; a drag where it was let go, carried by a flick
    const slot = s.dragged
      ? releaseSlot(e.clientX - s.origin, velocityOf(recent), s.positions)
      : nearestSlot(e.clientX - s.origin, s.positions)
    const rest = onCommit(slot, { dragged: s.dragged })
    if (rest !== activeSlot) s.pending = rest
    else endSteering()
    if (rest >= 0) s.target = s.positions[rest]
    run()
  }

  const onPointerCancel = () => {
    if (!s.held) return
    s.held = false
    endSteering()
    if (activeSlot >= 0) s.target = s.positions[activeSlot]
    run()
  }

  // The links' own click after a handled release would navigate a second time (or open the
  // sheet again): swallow it. Keyboard clicks (detail 0) go through.
  const onClickCapture = (e: React.MouseEvent) => {
    if (onBar(e) && e.detail !== 0 && performance.now() - s.handledAt < CLICK_GUARD) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture: onPointerCancel,
    onClickCapture,
  }
}
