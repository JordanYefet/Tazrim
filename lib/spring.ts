/**
 * JavaScript springs for things you hold (the tab capsule, a sheet being
 * dragged). CSS cannot carry a finger's velocity into a transition, and iOS
 * runs `linear()` easing on the main thread, so held things spring here.
 * Pure maths, tested in lib/__tests__/spring.test.ts and lib/nav/__tests__.
 */

/** Stiffness and damping from a response (seconds) and damping ratio, as in Apple's springs. */
export function spring(response: number, ratio: number): { k: number; c: number } {
  const w = (2 * Math.PI) / response
  return { k: w * w, c: (4 * Math.PI * ratio) / response }
}

/** Past an edge a dragged thing follows less and less: iOS's rubber band (0.55). */
export function rubberBand(over: number, dimension: number, constant = 0.55): number {
  const sign = over < 0 ? -1 : 1
  const a = Math.abs(over)
  return (sign * (a * dimension * constant)) / (dimension + constant * a)
}

/** Where a flick would come to rest: Apple's projection with a 0.99 deceleration rate (velocity in px/s). */
export function project(x: number, velocity: number, decelerationRate = 0.99): number {
  return x + ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
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

/** Integration sub-step: a stiff spring is only stable well below a 60Hz frame. */
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

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Run a spring on animation frames from `from` (with velocity `v`) to `to`,
 * calling `onFrame` with each position and `onDone` once at rest. Returns a
 * stop function, so a new touch can take over mid-flight. Under reduced
 * motion it jumps.
 */
export function animateSpring(
  from: number,
  to: number,
  v: number,
  params: { k: number; c: number },
  onFrame: (x: number) => void,
  onDone?: () => void
): () => void {
  if (prefersReducedMotion()) {
    onFrame(to)
    onDone?.()
    return () => {}
  }
  let s: SpringState = { x: from, v }
  let last = performance.now()
  let raf = requestAnimationFrame(function frame(t) {
    s = step(s, to, params, (t - last) / 1000)
    last = t
    if (atRest(s, to)) {
      onFrame(to)
      onDone?.()
      return
    }
    onFrame(s.x)
    raf = requestAnimationFrame(frame)
  })
  return () => cancelAnimationFrame(raf)
}
