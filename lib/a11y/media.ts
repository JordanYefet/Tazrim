/*
 * The accessibility preferences that mirror a system setting (ENG-128). Each one is on when the
 * system asks for it (a media query) or when the person turned the matching switch in
 * Settings → Accessibility (a token in the data-a11y attribute on <html>, set by the root layout and
 * components/a11y/a11y-provider.tsx). The CSS side is postcss/a11y-media.cjs: every such @media
 * block also applies under the attribute. Code that checks these preferences goes through here,
 * never through matchMedia directly.
 */

export type A11yMediaKind = 'motion' | 'transparency' | 'contrast'

const QUERY: Record<A11yMediaKind, string> = {
  motion: '(prefers-reduced-motion: reduce)',
  transparency: '(prefers-reduced-transparency: reduce)',
  contrast: '(prefers-contrast: more)',
}
const TOKEN: Record<A11yMediaKind, string> = {
  motion: 'still',
  transparency: 'contrast',
  contrast: 'contrast',
}

function matches(kind: A11yMediaKind): boolean {
  if (typeof window === 'undefined') return false
  const media = typeof window.matchMedia === 'function' && window.matchMedia(QUERY[kind]).matches
  return media || (document.documentElement.getAttribute('data-a11y') ?? '').split(' ').includes(TOKEN[kind])
}

export const prefersReducedMotion = () => matches('motion')
export const prefersReducedTransparency = () => matches('transparency')
export const prefersMoreContrast = () => matches('contrast')

// One observer on <html> for every subscriber
const listeners = new Set<() => void>()
let observer: MutationObserver | null = null

function ensureObserver() {
  if (observer || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver(() => listeners.forEach(fn => fn()))
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-a11y'] })
}

/** Call `cb` when the preference may have changed (the system setting or the data-a11y attribute on <html>). Returns the unsubscribe. */
export function subscribe(kind: A11yMediaKind, cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY[kind]) : null
  mq?.addEventListener?.('change', cb)
  // Only report real flips of the token, not every class change on <html>
  let last = matches(kind)
  const onClass = () => {
    const now = matches(kind)
    if (now !== last) {
      last = now
      cb()
    }
  }
  listeners.add(onClass)
  ensureObserver()
  return () => {
    mq?.removeEventListener?.('change', cb)
    listeners.delete(onClass)
  }
}
