'use client'

import { useCallback, useRef } from 'react'

/*
 * Windows open from where you tapped (like the header's period panel grows out
 * of its button). The last pointerdown is recorded app-wide; when a window
 * mounts, its transform-origin (--origin-x / --origin-y, used by .app-window
 * and .sheet in app/globals.css) is set to that point, relative to the
 * window's own box, so the scale-in grows from there and the exit folds back.
 * Opened from the keyboard: the focused element's centre (or a given anchor).
 * Nothing to go on: the CSS fallback, the window's centre.
 */

/** A tap older than this didn't open the window (an async open, a stale click) */
export const FRESH_MS = 1000

export interface PointStamp {
  x: number
  y: number
  t: number
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** Where the window should grow from, in viewport coordinates, or null for its centre. */
export function pickOriginPoint(
  pointer: PointStamp | null,
  keyAt: number,
  now: number,
  focused: Rect | null
): { x: number; y: number } | null {
  // A key pressed after the tap means the keyboard opened it
  if (pointer && now - pointer.t < FRESH_MS && pointer.t >= keyAt) return { x: pointer.x, y: pointer.y }
  if (focused && focused.width > 0 && focused.height > 0) {
    return { x: focused.left + focused.width / 2, y: focused.top + focused.height / 2 }
  }
  return null
}

interface Tracker {
  pointer: PointStamp | null
  keyAt: number
  /** What had focus at the last key press: the trigger of a keyboard open */
  keyEl: Element | null
}

const KEY = '__tazrimOpenOrigin'

// Kept on window, so a hot reload of this module still sees the one listener's data
function tracker(): Tracker | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, Tracker | undefined>
  let t = w[KEY]
  if (!t) {
    const created: Tracker = { pointer: null, keyAt: 0, keyEl: null }
    t = w[KEY] = created
    // Capture phase: seen even when a handler stops propagation
    document.addEventListener(
      'pointerdown',
      e => {
        created.pointer = { x: e.clientX, y: e.clientY, t: performance.now() }
      },
      { capture: true, passive: true }
    )
    document.addEventListener(
      'keydown',
      e => {
        created.keyAt = performance.now()
        created.keyEl = e.target instanceof Element ? e.target : null
      },
      { capture: true, passive: true }
    )
  }
  return t
}

// Listen from the first import, so the tap that opens the first window is caught
tracker()

function setOrigin(el: HTMLElement, anchor: Element | null) {
  const t = tracker()
  if (!t) return
  // Not the window's own autofocused field, nor the page itself
  const usable = (e: Element | null) =>
    e && e.isConnected && e !== document.body && e !== document.documentElement && !el.contains(e) ? e : null
  const focused = anchor ?? usable(t.keyEl) ?? usable(document.activeElement)
  const point = pickOriginPoint(t.pointer, t.keyAt, performance.now(), focused?.getBoundingClientRect() ?? null)
  if (!point) return
  // The entrance is scaling the window already; scaled about its centre, the
  // centre stays put, so the untransformed box is the centre ± its layout size
  const prev = el.style.transformOrigin
  el.style.transformOrigin = '50% 50%'
  const r = el.getBoundingClientRect()
  el.style.transformOrigin = prev
  const left = r.left + r.width / 2 - el.offsetWidth / 2
  const top = r.top + r.height / 2 - el.offsetHeight / 2
  el.style.setProperty('--origin-x', `${Math.round(point.x - left)}px`)
  el.style.setProperty('--origin-y', `${Math.round(point.y - top)}px`)
}

/**
 * Ref for a window's Dialog.Content: on mount, points its transform-origin at
 * what opened it. `anchor` stands in for the focused element on a keyboard
 * open (the ⌘K search grows out of the header's search button).
 */
export function useOpenOrigin<T extends HTMLElement = HTMLDivElement>(anchor?: () => Element | null) {
  const anchorRef = useRef(anchor)
  anchorRef.current = anchor
  // Once per mounted node: measuring mid-animation would read a scaled box
  const done = useRef<WeakSet<HTMLElement>>(new WeakSet())
  return useCallback((el: T | null) => {
    if (!el || done.current.has(el)) return
    done.current.add(el)
    setOrigin(el, anchorRef.current?.() ?? null)
  }, [])
}
