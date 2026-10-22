/*
 * When to bake glass (ENG-72, round 3), browser only. A bake is the whole
 * cost of the glass (lib/glass/bake.ts), so it happens only when what is
 * behind an element could have changed:
 *   - the element mounts or changes size (ResizeObserver)
 *   - the page above it changes height and moves it (ResizeObserver on <body>)
 *   - the window resizes, the theme or the background setting changes
 *     (attributes on <html>)
 *   - the wallet asks (requestGlassBake) after moving a card
 * Requests are debounced; an element that is still animating is baked once
 * its animations finish; an element whose position, size, theme and
 * background are unchanged is skipped. Nothing listens to scrolling: the
 * background scrolls with the document, so scrolling changes nothing behind
 * the glass.
 */

import { readBackgroundSetting } from '@/lib/background/read-setting'
import { bakeGlass } from '@/lib/glass/bake'
import { bakeKey, resolveRadius } from '@/lib/glass/geometry'

interface Entry {
  host: HTMLElement
  canvas: HTMLCanvasElement
  key: string
  onBaked: () => void
}

const entries = new Set<Entry>()
let timer = 0
let ready = false
let firstMarked = false
const DEBOUNCE_MS = 120

function animating(el: HTMLElement): Animation[] {
  if (typeof document.getAnimations !== 'function') return []
  return document.getAnimations().filter(a => {
    if (a.playState !== 'running' && !a.pending) return false
    const t = (a.effect as KeyframeEffect | null)?.target
    return t instanceof Element && (t === el || t.contains(el))
  })
}

function bakeOne(entry: Entry) {
  const { host, canvas } = entry
  if (!host.isConnected) return
  const running = animating(host)
  if (running.length) {
    // Bake once it settles; the bitmap travels with the element meanwhile
    Promise.allSettled(running.map(a => a.finished)).then(() => bakeOne(entry))
    return
  }
  const r = host.getBoundingClientRect()
  const width = host.offsetWidth
  const height = host.offsetHeight
  if (!width || !height || !r.width) return
  const root = document.documentElement
  const dark = root.classList.contains('dark')
  const setting = readBackgroundSetting(root)
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const rect = { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }
  const scaleX = r.width / width
  const key = bakeKey({ rect, scale: scaleX, dpr, theme: dark ? 'dark' : 'light', background: `${setting.kind}.${setting.palette}.${setting.strength}` })
  if (key === entry.key) return
  entry.key = key
  bakeGlass({
    target: canvas,
    width,
    height,
    radius: resolveRadius(getComputedStyle(host).borderTopLeftRadius, width, height),
    x: rect.x,
    y: rect.y,
    scaleX,
    scaleY: r.height / height,
    dpr,
    setting,
    dark,
    page: { width: root.clientWidth, scrollY: window.scrollY, viewportHeight: window.innerHeight },
  })
  if (!firstMarked) {
    firstMarked = true
    performance.mark('tazrim:glass-first-bake')
  }
  entry.onBaked()
}

function flush() {
  timer = 0
  for (const e of entries) bakeOne(e)
}

/** Ask every glass element to check whether it needs a new bake (debounced). */
export function requestGlassBake() {
  if (typeof window === 'undefined') return
  window.clearTimeout(timer)
  timer = window.setTimeout(flush, DEBOUNCE_MS)
}

let resize: ResizeObserver | null = null

function setup() {
  if (ready) return
  ready = true
  resize = new ResizeObserver(requestGlassBake)
  resize.observe(document.body)
  window.addEventListener('resize', requestGlassBake, { passive: true })
  new MutationObserver(requestGlassBake).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-bg', 'data-bg-palette', 'style'],
  })
}

/** Keeps `canvas` baked with the glass behind `host`. Returns the cleanup. */
export function trackGlass(host: HTMLElement, canvas: HTMLCanvasElement, onBaked: () => void): () => void {
  setup()
  const entry: Entry = { host, canvas, key: '', onBaked }
  entries.add(entry)
  resize?.observe(host)
  requestGlassBake()
  return () => {
    entries.delete(entry)
    resize?.unobserve(host)
  }
}
