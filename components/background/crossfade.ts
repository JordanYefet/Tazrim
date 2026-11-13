import { EASE, MOTION } from '@/lib/motion'

/*
 * Cross-fades the page background when the setting changes (browser only).
 * The new background is applied at once; this lays a copy of the old one
 * over it (.bg-crossfade in app/globals.css: under all content) and fades
 * the copy out. Call it before applying the new setting, then apply.
 *
 * The copy covers the viewport only (a document-sized layer would be a huge
 * texture on a long page); it sits on the document, so it scrolls with the
 * tile it copies. Glass re-bakes for the new background on its own clock
 * (components/glass/glass-bakery.ts: ~120ms debounce, then idle time), so
 * cards switch to the new backdrop partway through the fade.
 */
export function crossfadeBackground(apply: () => void) {
  if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply()
    return
  }
  const root = document.documentElement
  const html = getComputedStyle(root)
  const before = getComputedStyle(document.body, '::before')
  // Plain and the fixed wallpapers show a layer fixed to the viewport (body::before); the tiles, the tile on <html>
  const fixed = before.display !== 'none'

  const layer = document.createElement('div')
  layer.className = 'bg-crossfade'
  layer.setAttribute('aria-hidden', 'true')
  const st = layer.style
  st.top = `${window.scrollY}px`
  st.width = `${root.clientWidth}px`
  st.height = `${window.innerHeight}px`
  st.backgroundColor = html.backgroundColor
  if (fixed) {
    // Fixed to the viewport, and this layer is the viewport: same box, same look
    st.backgroundImage = before.backgroundImage
    st.backgroundSize = before.backgroundSize
    st.backgroundRepeat = before.backgroundRepeat
    st.backgroundPosition = before.backgroundPosition
    // More contrast paints it a solid colour instead
    if (before.backgroundColor !== 'rgba(0, 0, 0, 0)') st.backgroundColor = before.backgroundColor
  } else {
    // The tile is anchored at the document's top left: shift it by the scroll
    st.backgroundImage = html.backgroundImage
    st.backgroundSize = html.backgroundSize
    st.backgroundRepeat = html.backgroundRepeat
    st.backgroundPosition = `0 ${-window.scrollY}px`
  }
  document.body.appendChild(layer)
  apply()

  // A change mid-fade stacks a fresh copy on top; each removes itself
  const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.page, easing: EASE.ui, fill: 'forwards' })
  const done = () => layer.remove()
  fade.finished.then(done, done)
  // A tab in the background holds the finish back; the copy is clear by then, so a timer is enough
  window.setTimeout(done, MOTION.page + 100)
}
