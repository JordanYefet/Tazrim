/*
 * Motion tokens (ENG-67): one clock for the whole app.
 *
 * The same values live as CSS custom properties in app/globals.css
 * (--motion-* and --ease-*) and as Tailwind aliases (duration-quick / fast /
 * base / page, ease-ui / ease-spring); this module is for JavaScript
 * (WAAPI, Recharts, the rolling digits). Keep the three in step.
 *
 *   quick 140ms  press feedback, small popovers (the rail flyout)
 *   fast  240ms  exits, hover, small fades (the card total, notices)
 *   base  380ms  overlays arriving (dialogs, sheets), the tab capsule
 *   page  600ms  a page arriving: the card wallet's spring, the page content
 *                fade, the summary numbers' roll and the charts' entrance all
 *                start together and land on this beat
 */

export const MOTION = { quick: 140, fast: 240, base: 380, page: 600 } as const

export const EASE = {
  /** Strong ease-out: things arriving or responding */
  ui: 'cubic-bezier(0.23, 1, 0.32, 1)',
  /** iOS-like drawer curve: things moving into place */
  spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const

/**
 * Something that appears on a moving element (the total on the opening
 * card) starts when the motion is this far through, so it lands with it.
 */
export const LAND_AT = 0.6

/**
 * Recharts entrance on the page beat: no delay, same feel. A chart starts a
 * few frames after the page (its ResponsiveContainer measures first), so it
 * runs that much shorter and lands with everything else.
 */
export const CHART_ANIMATION = {
  animationBegin: 0,
  animationDuration: MOTION.page - 60,
  animationEasing: 'ease-out',
} as const

/**
 * Rolling digits: a cascade from the highest digit to the lowest, each starting `stagger`
 * after the one before it, the last landing at `duration` (a digit never rolls shorter
 * than `minDuration`). Slower than the page beat, by the owner's choice, so the roll and
 * its blur read. `blur` is the motion blur at full speed, SwiftUI's numericText.
 * The loading spin (globals.css, digit-spin) turns once per `duration`: keep them in step.
 */
export const ROLL = { duration: 950, stagger: 70, minDuration: 560, blur: '0.07em' } as const
