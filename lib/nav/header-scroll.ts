/**
 * Hide-on-scroll for the sticky header, as a pure reducer: hide after the
 * page has moved down `threshold` px from where the downward move began,
 * show again on any move up or near the top. Overscroll (iOS rubber-band)
 * is clamped away so the bounce at either end does not toggle the header.
 */
export interface HeaderScrollState {
  hidden: boolean
  lastY: number
  /** Where the current downward run started */
  anchorY: number
}

export interface HeaderScrollInput {
  y: number
  /** Largest real scroll offset (scrollHeight - innerHeight) */
  maxY: number
}

export interface HeaderScrollOptions {
  threshold: number
  /** Always visible this close to the top (about the header's height) */
  topZone: number
}

export const HEADER_SCROLL_INITIAL: HeaderScrollState = { hidden: false, lastY: 0, anchorY: 0 }
export const HEADER_SCROLL_DEFAULTS: HeaderScrollOptions = { threshold: 24, topZone: 56 }

export function headerScrollReducer(
  state: HeaderScrollState,
  { y: rawY, maxY }: HeaderScrollInput,
  { threshold, topZone }: HeaderScrollOptions = HEADER_SCROLL_DEFAULTS
): HeaderScrollState {
  const y = Math.min(Math.max(rawY, 0), Math.max(maxY, 0))
  if (y === state.lastY) return state
  if (y <= topZone || y < state.lastY) return { hidden: false, lastY: y, anchorY: y }
  // A run that starts inside the top zone counts from its edge
  const from = Math.max(state.anchorY, topZone)
  return { hidden: state.hidden || y - from > threshold, lastY: y, anchorY: state.anchorY }
}
