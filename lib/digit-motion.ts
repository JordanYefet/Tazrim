/*
 * The rolling digits' motion (components/ui/rolling-number.tsx), as plain functions.
 *
 * A digit strip holds 0–9 and a second 0 (ROWS rows), so a spin wraps from 9 to 0
 * without a jump: position p (in rows, 0 ≤ p ≤ 10) shows the digit p mod 10.
 *
 * The blur follows the speed (SwiftUI's numericText): sharp at rest, strongest at
 * full spinning speed. It is vertical only (an SVG filter per level, RollBlurDefs),
 * so a digit's sides stay crisp inside its window.
 */

import { ROLL } from '@/lib/motion'

export const ROWS = 11
/** Rows per millisecond at full spinning speed: one turn per ROLL.duration */
export const SPIN_SPEED = 10 / ROLL.duration
/** The spin speeds up from rest over this long */
export const SPIN_RAMP = 320
/** Blur levels: an SVG filter each (RollBlurDefs); 0 is no filter */
export const BLUR_LEVELS = 12
/** A landing never takes longer than this, however far it carries on */
const MAX_LANDING = 1400
const FRAME = 16

export const rowTransform = (p: number) => `translateY(${((-p * 100) / ROWS).toFixed(4)}%)`
export const blurFilter = (level: number) => (level > 0 ? `url(#roll-blur-${level})` : 'none')
/** A speed (rows/ms) as a blur level: full spinning speed is the strongest */
export const blurLevel = (speed: number) => Math.round(Math.min(1, Math.abs(speed) / SPIN_SPEED) * BLUR_LEVELS)

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const X = (t: number) => ((ax * t + bx) * t + cx) * t
  const Y = (t: number) => ((ay * t + by) * t + cy) * t
  const dX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return x => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let k = 0; k < 8; k++) {
      const err = X(t) - x
      const d = dX(t)
      if (Math.abs(err) < 1e-6 || !d) break
      t -= err / d
    }
    return Y(Math.min(1, Math.max(0, t)))
  }
}

/** The roll's curve: it eases out of rest and into the new digit, so the blur rises and clears */
export const ROLL_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const rollCurve = cubicBezier(0.65, 0, 0.35, 1)

/** Distance (rows) and speed (rows/ms) `x` ms into a spin: a smooth start, then full speed */
export function spinAt(x: number): { dist: number; speed: number } {
  if (x <= 0) return { dist: 0, speed: 0 }
  if (x < SPIN_RAMP) {
    const r = x / SPIN_RAMP
    return { dist: SPIN_SPEED * SPIN_RAMP * (r ** 3 - r ** 4 / 2), speed: SPIN_SPEED * (3 * r ** 2 - 2 * r ** 3) }
  }
  return { dist: SPIN_SPEED * (SPIN_RAMP / 2 + x - SPIN_RAMP), speed: SPIN_SPEED }
}

type Sample = { t: number; p: number; v: number }
export type Plan = { duration: number; transform: Keyframe[]; filter: Keyframe[] }

/**
 * Keyframes from position samples (p unwrapped, any number of turns). Each pass over a
 * whole turn is cut at 10 → 0 by two keyframes at one offset: the two rows look the
 * same, and the strip never runs back through every digit.
 */
function keyframes(samples: Sample[], duration: number): Plan {
  const transform: Keyframe[] = []
  const at = (t: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0)
  samples.forEach((s, i) => {
    if (i > 0) {
      const prev = samples[i - 1]
      for (let k = Math.floor(prev.p / 10) + 1; k <= Math.floor(s.p / 10); k++) {
        const t = prev.t + ((10 * k - prev.p) / (s.p - prev.p)) * (s.t - prev.t)
        transform.push({ transform: rowTransform(10), offset: at(t) }, { transform: rowTransform(0), offset: at(t) })
      }
    }
    transform.push({ transform: rowTransform(s.p - 10 * Math.floor(s.p / 10)), offset: at(s.t) })
  })
  const filter: Keyframe[] = []
  let last = -1
  samples.forEach((s, i) => {
    const level = blurLevel(s.v)
    if (level === last && i < samples.length - 1) return
    filter.push({ filter: blurFilter(level), offset: at(s.t) })
    last = level
  })
  return { duration, transform, filter }
}

function sample(duration: number, at: (t: number) => { p: number; v: number }): Sample[] {
  const steps = Math.max(2, Math.ceil(duration / FRAME))
  return Array.from({ length: steps + 1 }, (_, k) => {
    const t = (k / steps) * duration
    return { t, ...at(t) }
  })
}

/** The blur of a plain roll from one digit to another, on the roll's own curve and timing */
export function rollBlur(from: number, to: number, duration: number): Keyframe[] {
  const dist = to - from
  const h = 1e-3
  const speed = (u: number) =>
    ((rollCurve(Math.min(1, u + h)) - rollCurve(Math.max(0, u - h))) / (Math.min(1, u + h) - Math.max(0, u - h))) * (dist / duration)
  return keyframes(
    sample(duration, t => ({ p: 0, v: speed(t / duration) })),
    duration
  ).filter
}

/** The spin speeding up from `from` (a digit) over SPIN_RAMP */
export function spinStart(from: number): Plan {
  return keyframes(
    sample(SPIN_RAMP, t => {
      const s = spinAt(t)
      return { p: from + s.dist, v: s.speed }
    }),
    SPIN_RAMP
  )
}

/** One turn at full speed from where the spin start left off; repeated until the data arrives */
export function spinTurn(from: number): Plan {
  const start = (from + spinAt(SPIN_RAMP).dist) % 10
  return keyframes(
    sample(ROLL.duration, t => ({ p: start + SPIN_SPEED * t, v: SPIN_SPEED })),
    ROLL.duration
  )
}

/**
 * The landing, `spun` ms into a spin that started at `from`: it keeps spinning through its
 * place in the cascade (`delay`), then carries on forward at its speed and slows onto `to`
 * (a cubic from that speed to rest), the blur clearing as it slows.
 */
export function landing(from: number, spun: number, to: number, delay: number, duration: number): Plan {
  const state = (x: number) => {
    const s = spinAt(x)
    return { p: from + s.dist, v: s.speed }
  }
  const { p: p0, v: v0 } = state(spun + delay)
  const min = p0 + Math.max(1.2, (v0 * duration) / 3)
  let p1 = Math.floor(min / 10) * 10 + to
  while (p1 < min) p1 += 10
  const span = Math.min(MAX_LANDING, Math.max(duration, v0 > 0 ? (3 * (p1 - p0)) / v0 : duration))
  const total = delay + span
  return keyframes(
    sample(total, t => {
      if (t <= delay) return state(spun + t)
      const u = (t - delay) / span
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2
      const p = h00 * p0 + h10 * span * v0 + h01 * p1
      const v = ((6 * u ** 2 - 6 * u) * p0 + (3 * u ** 2 - 4 * u + 1) * span * v0 + (-6 * u ** 2 + 6 * u) * p1) / span
      return { p, v }
    }),
    total
  )
}
