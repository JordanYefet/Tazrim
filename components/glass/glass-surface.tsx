'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { decideGlassRenderer, type GlassRenderer } from '@/lib/glass/policy'
import { GlassGL } from '@/lib/glass/renderer'
import { LensInstance, SlabInstance, getPrefs, getServerPrefs, glassSlots, register, subscribePrefs } from './glass-runtime'

/*
 * The glass material of an account element (Account.color = "glass", ENG-72).
 * Render it as the first child of the face (.acct-card / .acct-bank /
 * .acct-mini); it fills the face beneath the content and reads the face's
 * size, radius and place on screen.
 *
 *   webgl  large elements that ask for it, while a WebGL slot is free: the
 *          refracting slab (lib/glass/renderer.ts) on a canvas
 *   css    everywhere else, and the fallback: the lens of the mockup, the
 *          page's lines redrawn inside (magnified, more so at the rim), a
 *          faint prism rim and highlights
 *   solid  reduced transparency / more contrast: hidden; the stylesheet gives
 *          the face an opaque surface
 *
 * The server renders the CSS version; WebGL takes over after mount.
 */
export function GlassSurface({ webgl = false, rim = true }: { webgl?: boolean; rim?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const linesRef = useRef<SVGSVGElement>(null)
  const edgeRef = useRef<SVGSVGElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const id = useId()
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getServerPrefs)
  const [mounted, setMounted] = useState(false)
  const [hasSlot, setHasSlot] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => setMounted(true), [])

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
    const lens = new LensInstance(host, lines, edgeRef.current)
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
          {rim && (
            <span className="glass__edge">
              <svg ref={edgeRef} width="100%" height="100%" />
            </span>
          )}
          <span className="glass__prism" />
          <span className="glass__sheen" />
        </>
      )}
    </span>
  )
}
