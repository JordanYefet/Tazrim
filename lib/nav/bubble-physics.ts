/**
 * The phone tab bar's draggable capsule (components/layout/tab-bubble.ts):
 * the maths, kept pure so it can be tested. Positions are pixels along the
 * bar from the first slot's resting place; slots are in DOM order, so in RTL
 * slot 0 is the rightmost and the positions are negative.
 */

/** Stiffness and damping from a response (seconds) and damping ratio, as in Apple's springs. */
export function spring(response: number, ratio: number): { k: number; c: number } {
  const w = (2 * Math.PI) / response
  return { k: w * w, c: 4 * Math.PI * ratio / response }
}

/** Under the finger: fast and critically damped, so it tracks 1:1 without lag or wobble. */
export const FOLLOW = spring(0.12, 1)
/** Letting go: a little bounce into the slot. */
export const SETTLE = spring(0.38, 0.78)

/** How much the capsule grows while held (~1.04), and how fast it gets there (about the quick beat). */
export const LIFT_SCALE = 0.04
export const LIFT_RATE = 18

/** Past either end the capsule follows less and less: iOS's rubber band (0.55). */
export function rubberBand(over: number, dimension: number, constant = 0.55): number {
  const sign = over < 0 ? -1 : 1
  const a = Math.abs(over)
  return sign * (a * dimension * constant) / (dimension + constant * a)
}

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

/** Where a flick would come to rest: Apple's projection with a 0.99 deceleration rate (velocity in px/s). */
export function project(x: number, velocity: number, decelerationRate = 0.99): number {
  return x + (velocity / 1000) * decelerationRate / (1 - decelerationRate)
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

/** Velocity (px/s) from recent samples [position, timeMs], oldest first. */
export function velocityOf(samples: [number, number][]): number {
  if (samples.length < 2) return 0
  const [x0, t0] = samples[0]
  const [x1, t1] = samples[samples.length - 1]
  const dt = t1 - t0
  return dt > 0 ? ((x1 - x0) / dt) * 1000 : 0
}

export interface SpringState {
  x: number
  v: number
}

/** Integration sub-step: the stiff follow spring is only stable well below a 60Hz frame. */
const SUB_STEP = 1 / 480

/**
 * Advance the spring by one frame toward `target` (dt in seconds, capped so a
 * dropped frame doesn't jump), in small semi-implicit Euler sub-steps.
 */
export function step(s: SpringState, target: number, p: { k: number; c: number }, dt: number): SpringState {
  let rest = Math.min(dt, 1 / 30)
  let { x, v } = s
  while (rest > 1e-9) {
    const h = Math.min(rest, SUB_STEP)
    v += (-p.k * (x - target) - p.c * v) * h
    x += v * h
    rest -= h
  }
  return { x, v }
}

/** At rest: close enough and slow enough to snap. */
export function atRest(s: SpringState, target: number): boolean {
  return Math.abs(s.v) < 3 && Math.abs(s.x - target) < 0.3
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
