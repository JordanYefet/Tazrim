/**
 * The phone tab bar's draggable capsule (components/layout/tab-bubble.ts):
 * the maths, kept pure so it can be tested. Positions are pixels along the
 * bar from the first slot's resting place; slots are in DOM order, so in RTL
 * slot 0 is the rightmost and the positions are negative. The spring maths
 * is shared with the sheets (lib/spring.ts).
 */

import { project, rubberBand, spring } from '@/lib/spring'

export { atRest, project, rubberBand, spring, step, velocityOf, type SpringState } from '@/lib/spring'

/** Under the finger: fast and critically damped, so it tracks 1:1 without lag or wobble. */
export const FOLLOW = spring(0.12, 1)
/** Letting go: a little bounce into the slot. */
export const SETTLE = spring(0.38, 0.78)

/** How much the capsule grows while held (~1.04), and how fast it gets there (about the quick beat). */
export const LIFT_SCALE = 0.04
export const LIFT_RATE = 18


/** Clamp a finger position to the slots' span, rubber-banding the overshoot (dimension: a slot's width). */
export function follow(raw: number, positions: number[], dimension: number): number {
  const lo = Math.min(...positions)
  const hi = Math.max(...positions)
  if (raw < lo) return lo - rubberBand(lo - raw, dimension)
  if (raw > hi) return hi + rubberBand(raw - hi, dimension)
  return raw
}

export function nearestSlot(x: number, positions: number[]): number {
  let best = 0
  for (let i = 1; i < positions.length; i++) {
    if (Math.abs(positions[i] - x) < Math.abs(positions[best] - x)) best = i
  }
  return best
}


/**
 * The slot a release lands on: the nearest to where a flick would carry it,
 * but never more than one slot past the one under the finger.
 */
export function releaseSlot(x: number, velocity: number, positions: number[]): number {
  const here = nearestSlot(x, positions)
  const there = nearestSlot(project(x, velocity), positions)
  return Math.max(here - 1, Math.min(here + 1, there))
}

/**
 * The bar's geometry from the slots' boxes (DOM order). Everything is measured
 * from the middle of slot 0, so a finger's offset from `origin` is directly
 * where the capsule's middle goes, and the nearest slot is the one under it.
 */
export function slotLayout(boxes: { left: number; width: number }[]) {
  const first = boxes[0]
  return {
    origin: first.left + first.width / 2,
    slotWidth: first.width,
    positions: boxes.map(b => b.left - first.left),
  }
}
