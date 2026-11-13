import { flushSync } from 'react-dom'
import { prefersReducedMotion } from '@/lib/spring'

/**
 * Runs a theme change as a cross-fade of the whole page (View Transitions API,
 * the root only: no movement, `--motion-fast`, app/globals.css). The change is
 * applied inside the transition's callback, flushed, so the browser captures the
 * new theme with the class, the page backdrop and the charts already switched.
 * `data-theme-fade` holds the elements' own colour transitions still meanwhile
 * (the snapshot would show them halfway, and they would glide again after the fade).
 * No `startViewTransition` (older Safari, Firefox) or reduced motion: `apply` runs
 * as it always did, and nothing else in the app starts a view transition.
 */
export function withThemeFade(apply: () => void) {
  const start = (document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } }).startViewTransition
  if (typeof start !== 'function' || prefersReducedMotion()) {
    apply()
    return
  }
  const root = document.documentElement
  root.setAttribute('data-theme-fade', '')
  const transition = start.call(document, () => flushSync(apply))
  const done = () => root.removeAttribute('data-theme-fade')
  transition.finished.then(done, done)
}
