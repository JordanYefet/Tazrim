/**
 * When the phone tab bar shrinks (components/layout/bottom-nav.tsx): on the
 * header's own signal (lib/nav/header-scroll.ts, so both move on the same beat)
 * it shrinks while the page scrolls down and is full again on any scroll up or
 * at the top. It is always full while the "עוד" sheet is open or opening, for a
 * moment after a route change, and after a touch on it, until the page has
 * moved down another stretch from there. Pure, for tests; what the touch and
 * the focus do within the bar is CSS (app/globals.css, .tab-bar[data-shrunk]).
 */

/** How far the page must move down after a touch on the bar before it shrinks again */
export const ENGAGE_RELEASE = 24
/** How long it stays full after a route change, ms */
export const ROUTE_CALM_MS = 700

export interface TabBarShrinkInput {
  /** The header's hide-on-scroll signal */
  headerHidden: boolean
  sheetOpen: boolean
  /** A route changed a moment ago */
  calm: boolean
  /** Touched while shrunk and the page has not moved on yet */
  engaged: boolean
}

export function tabBarShrunk({ headerHidden, sheetOpen, calm, engaged }: TabBarShrinkInput): boolean {
  return headerHidden && !sheetOpen && !calm && !engaged
}

/** A touch at scroll offset `engagedAt` still holds the bar open at `y` */
export function stillEngaged(engagedAt: number, y: number, release = ENGAGE_RELEASE): boolean {
  return y - engagedAt <= release
}
