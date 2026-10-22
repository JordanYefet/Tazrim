/*
 * When to bake glass, and keeping what was baked (ENG-72, round 4). Browser only.
 *
 * A bake (lib/glass/bake.ts) is the whole cost of the glass, so:
 *   - bakes run in idle time, one per idle slice (requestIdleCallback, with
 *     a timeout so they never wait forever), never while scrolling: the
 *     background scrolls with the document, so scrolling changes nothing
 *   - every result is kept in a small in-memory cache keyed by the element
 *     (its account), its place and size on the document, theme, background
 *     setting and pixel ratio; showing a cached bake is one drawImage
 *   - places an element is about to move to can be baked ahead
 *     (prebakeGlass; the wallet does this for every card's stack and open
 *     placements) and shown the moment it starts moving (showGlassAt), so
 *     the glass is right from the first frame of the motion
 *   - after something settles, the element is checked against what it
 *     shows and baked again only if it is more than SETTLE_TOLERANCE px off
 * What triggers a check: mount, the element or <body> changing size (the
 * element may have moved), window resize, theme or background change
 * (attributes on <html>), and requestGlassBake().
 */

import { readBackgroundSetting } from '@/lib/background/read-setting'
import { bakeGlass } from '@/lib/glass/bake'
import { cacheKey, nearSameRect, resolveRadius, type Rect } from '@/lib/glass/geometry'

/** An element on the document: where it is (on-screen size) and its scale. */
export interface Placement {
  rect: Rect
  scaleX: number
  scaleY: number
}

interface Entry {
  host: HTMLElement
  canvas: HTMLCanvasElement
  id: string
  /** What the canvas shows now */
  shown: { key: string; rect: Rect } | null
  onShown: () => void
}

interface Job {
  host: HTMLElement
  id: string
  placement: Placement
  key: string
  /** Show it on this entry once baked (a check found the element needs it) */
  entry?: Entry
}

/** Within this many px of the place it was baked for, a bake is still right. */
export const SETTLE_TOLERANCE = 2
const CACHE_LIMIT = 10
const DEBOUNCE_MS = 120

const entries = new Set<Entry>()
const cache = new Map<string, { canvas: HTMLCanvasElement; rect: Rect }>()
const queue: Job[] = []
let idleHandle = 0
let checkTimer = 0
let ready = false
let autoId = 0
let firstMarked = false

type DebugWindow = Window & { __tazrimGlassCopies?: number }

function env() {
  const root = document.documentElement
  const s = readBackgroundSetting(root)
  return {
    dark: root.classList.contains('dark'),
    setting: s,
    background: `${s.kind}.${s.palette}.${s.strength}`,
    dpr: Math.min(3, window.devicePixelRatio || 1),
  }
}

function keyFor(id: string, host: HTMLElement, p: Placement): string {
  const e = env()
  return cacheKey({ id, width: host.offsetWidth, height: host.offsetHeight, rect: p.rect, scale: p.scaleX, dpr: e.dpr, theme: e.dark ? 'dark' : 'light', background: e.background })
}

function remember(key: string, canvas: HTMLCanvasElement, rect: Rect) {
  cache.delete(key)
  cache.set(key, { canvas, rect })
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
}

/** A bake for this key, or one for the same glass within SETTLE_TOLERANCE px of this place. */
function findCached(key: string, rect: Rect): { key: string; canvas: HTMLCanvasElement } | null {
  const exact = cache.get(key)
  if (exact) return { key, canvas: exact.canvas }
  const prefix = key.split('@')[0]
  for (const [k, v] of cache) {
    if (k.split('@')[0] === prefix && nearSameRect(v.rect, rect, SETTLE_TOLERANCE)) return { key: k, canvas: v.canvas }
  }
  return null
}

function show(entry: Entry, wanted: string, rect: Rect): boolean {
  const found = findCached(wanted, rect)
  if (!found) return false
  const { key, canvas: baked } = found
  if (entry.shown?.key === key) return true
  // Touch it (most recently used)
  const hit = cache.get(key)!
  cache.delete(key)
  cache.set(key, hit)
  const c = entry.canvas
  if (c.width !== baked.width) c.width = baked.width
  if (c.height !== baked.height) c.height = baked.height
  const ctx = c.getContext('2d')
  if (!ctx) return false
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.drawImage(baked, 0, 0)
  entry.shown = { key, rect }
  const w = window as DebugWindow
  if (typeof w.__tazrimGlassCopies === 'number') w.__tazrimGlassCopies++
  entry.onShown()
  return true
}

function bake(job: Job) {
  const { host, placement } = job
  if (!host.isConnected || findCached(job.key, placement.rect)) return
  const width = host.offsetWidth
  const height = host.offsetHeight
  if (!width || !height) return
  const e = env()
  const target = document.createElement('canvas')
  bakeGlass({
    target,
    width,
    height,
    radius: resolveRadius(getComputedStyle(host).borderTopLeftRadius, width, height),
    x: placement.rect.x,
    y: placement.rect.y,
    scaleX: placement.scaleX,
    scaleY: placement.scaleY,
    dpr: e.dpr,
    setting: e.setting,
    dark: e.dark,
    page: { width: document.documentElement.clientWidth, scrollY: window.scrollY, viewportHeight: window.innerHeight },
  })
  remember(job.key, target, placement.rect)
  if (!firstMarked) {
    firstMarked = true
    performance.mark('tazrim:glass-first-bake')
  }
}

function runIdle(deadline?: IdleDeadline) {
  idleHandle = 0
  // One bake per idle slice, more only while the slice still has room
  do {
    const job = queue.shift()
    if (!job) return
    bake(job)
    if (job.entry && entries.has(job.entry)) show(job.entry, job.key, job.placement.rect)
  } while (deadline && !deadline.didTimeout && deadline.timeRemaining() > 12 && queue.length)
  if (queue.length) scheduleIdle()
}

function scheduleIdle() {
  if (idleHandle || !queue.length) return
  const ric = (window as Window & { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback
  idleHandle = ric ? ric(runIdle, { timeout: 400 }) : window.setTimeout(() => runIdle(), 60)
}

function enqueue(job: Job, urgent: boolean) {
  const at = queue.findIndex(j => j.key === job.key)
  if (at >= 0) {
    // Already waiting: keep the request to show it
    if (job.entry) queue[at].entry = job.entry
    if (urgent && at > 0) queue.unshift(queue.splice(at, 1)[0])
    scheduleIdle()
    return
  }
  if (urgent) queue.unshift(job)
  else queue.push(job)
  scheduleIdle()
}

function animating(el: HTMLElement): Animation[] {
  if (typeof document.getAnimations !== 'function') return []
  return document.getAnimations().filter(a => {
    if (a.playState !== 'running' && !a.pending) return false
    const t = (a.effect as KeyframeEffect | null)?.target
    return t instanceof Element && (t === el || t.contains(el))
  })
}

/** Where an element is now, on the document. */
export function placementOf(host: HTMLElement): Placement | null {
  const r = host.getBoundingClientRect()
  if (!r.width || !host.offsetWidth) return null
  return {
    rect: { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height },
    scaleX: r.width / host.offsetWidth,
    scaleY: r.height / host.offsetHeight,
  }
}

function check(entry: Entry) {
  const { host } = entry
  if (!host.isConnected || host.closest('[data-hidden]')) return
  const running = animating(host)
  if (running.length) {
    Promise.allSettled(running.map(a => a.finished)).then(() => check(entry))
    return
  }
  const p = placementOf(host)
  if (!p) return
  const key = keyFor(entry.id, host, p)
  if (entry.shown?.key === key) return
  if (show(entry, key, p.rect)) return
  // Close enough to what it shows (same size, theme, background): keep it
  if (entry.shown && entry.shown.key.split('@')[0] === key.split('@')[0] && nearSameRect(entry.shown.rect, p.rect, SETTLE_TOLERANCE)) return
  enqueue({ host, id: entry.id, placement: p, key, entry }, true)
}

function flush() {
  checkTimer = 0
  for (const e of entries) check(e)
}

/** Ask every glass element to check whether it shows the right bake (debounced). */
export function requestGlassBake() {
  if (typeof window === 'undefined') return
  window.clearTimeout(checkTimer)
  checkTimer = window.setTimeout(flush, DEBOUNCE_MS)
}

/** Bake `host`'s glass for a place it will move to, in idle time. */
export function prebakeGlass(host: HTMLElement, id: string, placement: Placement) {
  const key = keyFor(id, host, placement)
  if (findCached(key, placement.rect)) return
  enqueue({ host, id, placement, key }, false)
}

/** Show `host`'s glass for a place it is moving to, if it was baked ahead. True when shown. */
export function showGlassAt(host: HTMLElement, placement: Placement): boolean {
  for (const e of entries) {
    if (e.host !== host) continue
    return show(e, keyFor(e.id, host, placement), placement.rect)
  }
  return false
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

/**
 * Keeps `canvas` showing the glass behind `host`. `id` names what the glass
 * belongs to (an account), so its bakes are found again after navigating.
 */
export function trackGlass(host: HTMLElement, canvas: HTMLCanvasElement, id: string | undefined, onShown: () => void): () => void {
  setup()
  const entry: Entry = { host, canvas, id: id ?? `el${++autoId}`, shown: null, onShown }
  entries.add(entry)
  resize?.observe(host)
  requestGlassBake()
  return () => {
    entries.delete(entry)
    resize?.unobserve(host)
  }
}
