/*
 * Which glass an element gets (ENG-72).
 *
 *   webgl  the refracting slab (components/glass/glass-canvas.tsx): large
 *          elements only (a hero, the front wallet card, the add / edit
 *          preview), at most MAX_GL_INSTANCES at a time (browsers cap WebGL
 *          contexts, iOS Safari especially, and each one costs memory)
 *   css    the CSS lens of the mockup: the background lines redrawn inside the
 *          element, magnified and bent at the rim, a prism edge and highlights
 *   solid  an opaque surface: reduced transparency or more contrast asked for
 */

export const MAX_GL_INSTANCES = 4

export type GlassRenderer = 'webgl' | 'css' | 'solid'

export interface GlassEnvironment {
  /** The element asks for the WebGL slab (large elements only) */
  wantsWebGL: boolean
  /** WebGL2RenderingContext exists */
  webgl2: boolean
  /** prefers-reduced-transparency: reduce */
  reducedTransparency: boolean
  /** prefers-contrast: more */
  moreContrast: boolean
  /** This element's WebGL failed before (context lost, shader error) */
  failed?: boolean
  /** Whether it holds (or could get) one of the WebGL slots */
  hasSlot: boolean
}

export function decideGlassRenderer(env: GlassEnvironment): GlassRenderer {
  if (env.reducedTransparency || env.moreContrast) return 'solid'
  if (!env.wantsWebGL || !env.webgl2 || env.failed || !env.hasSlot) return 'css'
  return 'webgl'
}

/**
 * The WebGL slots: the first `cap` elements that ask get one, the rest wait
 * (and show the CSS lens). A released slot goes to the oldest waiting element.
 */
export interface SlotRegistry {
  /** Ask for a slot; true when this id holds one now */
  acquire(id: string): boolean
  /** Give a slot back (or stop waiting) */
  release(id: string): void
  holds(id: string): boolean
  /** Called whenever slots change hands */
  subscribe(fn: () => void): () => void
  readonly inUse: number
}

export function createSlotRegistry(cap = MAX_GL_INSTANCES): SlotRegistry {
  const holders = new Set<string>()
  const waiting: string[] = []
  const subs = new Set<() => void>()
  const notify = () => subs.forEach(fn => fn())
  return {
    acquire(id) {
      if (holders.has(id)) return true
      if (holders.size < cap) {
        holders.add(id)
        const w = waiting.indexOf(id)
        if (w >= 0) waiting.splice(w, 1)
        notify()
        return true
      }
      if (!waiting.includes(id)) waiting.push(id)
      return false
    },
    release(id) {
      const w = waiting.indexOf(id)
      if (w >= 0) waiting.splice(w, 1)
      if (!holders.delete(id)) return
      const next = waiting.shift()
      if (next !== undefined) holders.add(next)
      notify()
    },
    holds(id) {
      return holders.has(id)
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    get inUse() {
      return holders.size
    },
  }
}
