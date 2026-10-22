'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { decideGlassRenderer } from '@/lib/glass/policy'
import { trackGlass } from './glass-bakery'

/*
 * The glass material of an account element (Account.color = "glass", ENG-72).
 * Render it as the first child of the face (.acct-card / .acct-bank /
 * .acct-mini); it fills the face beneath the content.
 *
 *   baked   large elements (a hero, the front wallet card, the add / edit
 *           preview): a liquid-glass lens computed once into a canvas
 *           (lib/glass/bake.ts, scheduled by ./glass-bakery.ts). Until the
 *           first bake, and as its base, the static look below.
 *   static  everything else: a light tint, a thin rim and an inner
 *           highlight in CSS. No blur, no backdrop-filter.
 *   solid   reduced transparency / more contrast: the stylesheet gives the
 *           face an opaque surface.
 * Nothing here runs while the page scrolls.
 */

interface Prefs {
  reducedTransparency: boolean
  moreContrast: boolean
}
const SERVER: Prefs = { reducedTransparency: false, moreContrast: false }
let prefs: Prefs = SERVER
let watching = false
const subs = new Set<() => void>()
function watch() {
  if (watching || typeof window === 'undefined') return
  watching = true
  const rt = window.matchMedia('(prefers-reduced-transparency: reduce)')
  const mc = window.matchMedia('(prefers-contrast: more)')
  const read = () => {
    prefs = { reducedTransparency: rt.matches, moreContrast: mc.matches }
    subs.forEach(fn => fn())
  }
  rt.addEventListener?.('change', read)
  mc.addEventListener?.('change', read)
  read()
}
function subscribe(fn: () => void) {
  watch()
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
const getPrefs = () => {
  watch()
  return prefs
}
const getServer = () => SERVER

export function GlassSurface({ baked = false }: { baked?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const p = useSyncExternalStore(subscribe, getPrefs, getServer)
  const renderer = decideGlassRenderer({ baked, reducedTransparency: p.reducedTransparency, moreContrast: p.moreContrast })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = ref.current?.parentElement
    const canvas = canvasRef.current
    if (renderer !== 'baked' || !host || !canvas) return
    return trackGlass(host, canvas, () => setReady(true))
  }, [renderer])

  return (
    <span ref={ref} aria-hidden className="glass" data-renderer={renderer}>
      {renderer === 'baked' && <canvas ref={canvasRef} className="glass__bake" data-ready={ready ? '' : undefined} />}
    </span>
  )
}
