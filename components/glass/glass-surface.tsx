'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { decideGlassRenderer, type GlassRenderer } from '@/lib/glass/policy'
import { GlassGL } from '@/lib/glass/renderer'
import { glowGradients } from '@/lib/glass/glow'
import { LensInstance, SlabInstance, getPrefs, getServerPrefs, glassSlots, glowEnabled, register, subscribePrefs } from './glass-runtime'

const GLOW_STYLE = { backgroundImage: glowGradients() }

/*
 * The glass material of an account element (Account.color = "glass", ENG-72).
 * Render it as the first child of the face (.acct-card / .acct-bank /
 * .acct-mini); it fills the face beneath the content and reads the face's
 * size, radius and place on screen.
 *
 *   webgl  large elements that ask for it, while a WebGL slot is free: the
 *          refracting slab (lib/glass/renderer.ts) on a canvas
 *   css    everywhere else, and the fallback: the same frosted look in CSS
 *          (backdrop blur, the page's lines redrawn inside and blurred, the
 *          glow, a milky tint and a thin rim)
 *   solid  reduced transparency / more contrast: hidden; the stylesheet gives
 *          the face an opaque surface
 *
 * The colour glow behind glass (lib/glass/glow.ts) is drawn inside the
 * element and, as a coloured halo, just outside it (`halo`; off for the mini
 * faces in lists).
 *
 * The server renders the CSS version; WebGL takes over after mount.
 */
export function GlassSurface({ webgl = false, halo = true }: { webgl?: boolean; halo?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const id = useId()
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs)
  const [mounted, setMounted] = useState(false)
  const [hasSlot, setHasSlot] = useState(false)
  const [failed, setFailed] = useState(false)
  const [glow, setGlow] = useState(false)
  useEffect(() => {
    setMounted(true)
    setGlow(glowEnabled())
  }, [])

  // The halo outside the element is the face's own (coloured) shadow
  useEffect(() => {
    const host = ref.current?.parentElement
    if (!host || !glow) return
    host.dataset.glassGlow = halo ? 'halo' : 'inside'
    return () => {
      delete host.dataset.glassGlow
    }
  }, [glow, halo])

  // Ask for a WebGL slot only when it could be used
  const canUseGL = mounted && webgl && prefs.webgl2 && !prefs.reducedTransparency && !prefs.moreContrast && !failed
  useEffect(() => {
    if (!canUseGL) return
    const reg = glassSlots()
    const sync = () => setHasSlot(reg.holds(id))
    const unsub = reg.subscribe(sync)
    reg.acquire(id)
    sync()
    return () => {
      unsub()
      reg.release(id)
      setHasSlot(false)
    }
  }, [canUseGL, id])

  const renderer: GlassRenderer = mounted
    ? decideGlassRenderer({ wantsWebGL: webgl, webgl2: prefs.webgl2, reducedTransparency: prefs.reducedTransparency, moreContrast: prefs.moreContrast, failed, hasSlot })
    : 'css'

  // The CSS lens follows the page while it is shown
  useEffect(() => {
    const host = ref.current?.parentElement
    const lines = linesRef.current
    if (renderer !== 'css' || !host || !lines) return
    const lens = new LensInstance(host, lines)
    const unregister = register(lens)
    return () => {
      unregister()
      lens.dispose()
    }
  }, [renderer])

  // The WebGL slab
  useEffect(() => {
    const host = ref.current?.parentElement
    const canvas = canvasRef.current
    if (renderer !== 'webgl' || !host || !canvas) return
    let gl: GlassGL
    try {
      gl = new GlassGL(canvas)
    } catch {
      setFailed(true)
      return
    }
    const slab = new SlabInstance(host, gl, () => setFailed(true))
    host.dataset.glassGl = ''
    const unregister = register(slab)
    const lost = (e: Event) => {
      e.preventDefault()
      setFailed(true)
    }
    canvas.addEventListener('webglcontextlost', lost)
    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      unregister()
      delete host.dataset.glassGl
      gl.dispose()
    }
  }, [renderer])

  return (
    <span ref={ref} aria-hidden className="glass" data-renderer={renderer}>
      {renderer === 'webgl' ? (
        <canvas ref={canvasRef} className="glass__gl" />
      ) : (
        <>
          <svg ref={linesRef} className="glass__lines" width="100%" height="100%" />
          {glow && <span className="glass__glow" style={GLOW_STYLE} />}
          <span className="glass__tint" />
          <span className="glass__rim" />
        </>
      )}
    </span>
  )
}
