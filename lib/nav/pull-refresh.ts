/**
 * Pull to refresh for the installed app (components/layout/pull-to-refresh.tsx),
 * as a pure reducer: an installed PWA has no browser chrome, so nothing else can
 * reload a page. The gesture starts at the very top of the page, locks to itself
 * only once it is clearly a downward drag (a sideways one belongs to whatever
 * scrolls or swipes there), moves the indicator at half the finger's pace, arms
 * past a threshold, and on release refreshes if armed. Listeners stay passive:
 * iOS rubber-bands the page natively and the indicator shows in that gap.
 */

export type PullPhase = 'idle' | 'tracking' | 'pulling' | 'refreshing'

export interface PullState {
  phase: PullPhase
  startX: number
  startY: number
  /** The indicator's resisted travel, px */
  pull: number
  /** Past the threshold: letting go refreshes */
  armed: boolean
}

export type PullEvent =
  | { type: 'start'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'end' }
  | { type: 'cancel' }
  /** The refresh is over and the indicator has gone */
  | { type: 'settled' }

export const PULL = {
  /** Resisted travel at which letting go refreshes */
  threshold: 64,
  /** Furthest the indicator travels */
  max: 96,
  /** Where it rests while refreshing */
  rest: 56,
  /** The indicator moves this much per px of finger */
  resistance: 0.5,
  /** Finger travel before the gesture decides what it is */
  slop: 10,
  /** The spinner stays at least this long, so a quick refresh does not flash */
  minSpinMs: 500,
} as const

export const PULL_INITIAL: PullState = { phase: 'idle', startX: 0, startY: 0, pull: 0, armed: false }

export function resist(dy: number): number {
  return Math.min(PULL.max, Math.max(0, dy) * PULL.resistance)
}

export function pullReducer(state: PullState, event: PullEvent): PullState {
  switch (event.type) {
    case 'start':
      // A second pull while refreshing (or mid-gesture) is ignored
      if (state.phase !== 'idle') return state
      return { phase: 'tracking', startX: event.x, startY: event.y, pull: 0, armed: false }
    case 'move': {
      if (state.phase === 'tracking') {
        const dx = event.x - state.startX
        const dy = event.y - state.startY
        if (Math.abs(dx) <= PULL.slop && Math.abs(dy) <= PULL.slop) return state
        // Up, or sideways-dominant: not ours
        if (dy <= 0 || Math.abs(dx) > dy) return PULL_INITIAL
        const pull = resist(dy - PULL.slop)
        return { ...state, phase: 'pulling', pull, armed: pull >= PULL.threshold }
      }
      if (state.phase === 'pulling') {
        const pull = resist(event.y - state.startY - PULL.slop)
        return { ...state, pull, armed: pull >= PULL.threshold }
      }
      return state
    }
    case 'end':
      if (state.phase === 'tracking') return PULL_INITIAL
      if (state.phase !== 'pulling') return state
      return state.armed ? { ...state, phase: 'refreshing', pull: PULL.rest, armed: false } : PULL_INITIAL
    case 'cancel':
      return state.phase === 'tracking' || state.phase === 'pulling' ? PULL_INITIAL : state
    case 'settled':
      return state.phase === 'refreshing' ? PULL_INITIAL : state
  }
}

export interface PullStartContext {
  scrollY: number
  touches: number
  /** A dialog, sheet, menu or scroll lock is open */
  overlayOpen: boolean
  /** The touch began on the phone tab bar */
  onTabBar: boolean
  /** Inside a nested scroller that is itself scrolled down */
  inScrolledScroller: boolean
  /** On the card wallet or anything else that handles drags itself */
  onDragSurface: boolean
}

/** Whether a touch may begin a pull */
export function canStartPull(c: PullStartContext): boolean {
  return c.scrollY <= 0 && c.touches === 1 && !c.overlayOpen && !c.onTabBar && !c.inScrolledScroller && !c.onDragSurface
}

/** How much longer the spinner must stay once the refresh is done */
export function spinRemaining(startedAt: number, now: number): number {
  return Math.max(0, PULL.minSpinMs - (now - startedAt))
}
